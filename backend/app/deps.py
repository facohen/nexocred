import uuid
from collections.abc import Callable, Coroutine
from typing import Annotated, Any

import jwt
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import ErrorAPI
from app.m12_auth.modelos import Usuario
from app.m12_auth.seguridad import decodificar_token
from app.m12_auth.servicio import obtener_usuario

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(request: Request, session: SessionDep) -> Usuario:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise ErrorAPI("no_autenticado", "falta token de autenticacion", status=401)
    token = auth.removeprefix("Bearer ").strip()
    try:
        payload = decodificar_token(token)
    except jwt.PyJWTError as exc:
        raise ErrorAPI("no_autenticado", "token invalido o expirado", status=401) from exc
    if payload.get("type") != "access":
        raise ErrorAPI("no_autenticado", "tipo de token invalido", status=401)
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise ErrorAPI("no_autenticado", "token invalido", status=401) from exc
    usuario = await obtener_usuario(session, user_id)
    if usuario is None or not usuario.activo:
        raise ErrorAPI("no_autenticado", "usuario inexistente o inactivo", status=401)
    return usuario


CurrentUser = Annotated[Usuario, Depends(get_current_user)]


def requiere_rol(
    *roles: str,
) -> Callable[[Usuario], Coroutine[Any, Any, Usuario]]:
    async def _dep(usuario: CurrentUser) -> Usuario:
        nombres = {r.nombre for r in usuario.roles}
        if not nombres.intersection(roles):
            raise ErrorAPI(
                "prohibido",
                "no tiene permisos para esta operacion",
                status=403,
                details={"roles_requeridos": list(roles)},
            )
        return usuario

    return _dep


# Modelo de 5 roles:
#   vendedor          -> origina, propone novación, CRM, sus clientes
#   analista_riesgo   -> evalúa y aprueba (aprobar = desembolsar)
#   administrativo    -> pagos, caja, rutas/cobranza, CRM, tesorería, cartera
#   ceo               -> dashboards (Torre + Analytics), solo lectura
#   admin_sistema     -> configuración (usuarios, catálogo, matrices)
#
# Dependencias semánticas. Los nombres describen QUIÉN puede, no un rol literal.
ConfigUser = Annotated[Usuario, Depends(requiere_rol("admin_sistema"))]
AnalistaRiesgo = Annotated[Usuario, Depends(requiere_rol("analista_riesgo"))]
Administrativo = Annotated[Usuario, Depends(requiere_rol("administrativo"))]
Vendedor = Annotated[Usuario, Depends(requiere_rol("vendedor"))]
Ceo = Annotated[Usuario, Depends(requiere_rol("ceo"))]
# Operación administrativa o dirección (lectura de dashboards financieros).
AdministrativoOCeo = Annotated[
    Usuario, Depends(requiere_rol("administrativo", "ceo"))
]

# Originación temprana (crear/simular): el vendedor arma/cotiza; el analista de
# riesgo también (evalúa lo que origina). Evaluar/desembolsar -> AnalistaRiesgo.
OriginaSolicitud = Annotated[
    Usuario, Depends(requiere_rol("vendedor", "analista_riesgo"))
]
# Propone novación: vendedor propone, analista de riesgo confirma.
ProponeNovacion = Annotated[
    Usuario, Depends(requiere_rol("vendedor", "analista_riesgo"))
]
# CRM: vendedor (su relación con clientes) y administrativo (gestión operativa).
CrmActor = Annotated[Usuario, Depends(requiere_rol("vendedor", "administrativo"))]


# Roles con lectura global de la cartera: ven todo y pueden filtrar libremente.
_ROLES_LECTURA_GLOBAL = frozenset(
    {"admin_sistema", "analista_riesgo", "administrativo", "ceo"}
)


def scope_vendedor(
    actor: Usuario, vendedor_id: uuid.UUID | None
) -> uuid.UUID | None:
    """Resuelve a qué vendedor restringir una lectura de cartera.

    Un vendedor *puro* (sin ningún rol de lectura global) solo ve lo suyo: se
    ignora el `vendedor_id` recibido y se fuerza su propio id. Si además tiene un
    rol privilegiado (super-usuario con todos los roles), prima la lectura global
    y se respeta el filtro opcional. Reutilizable en cualquier listado scopeado
    por vendedor (solicitudes, préstamos, personas).
    """
    roles = {r.nombre for r in actor.roles}
    if "vendedor" in roles and roles.isdisjoint(_ROLES_LECTURA_GLOBAL):
        return actor.id
    return vendedor_id
