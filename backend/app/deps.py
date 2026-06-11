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


# Dependencias de rol pre-construidas (evita llamar requiere_rol() en defaults).
AdminUser = Annotated[Usuario, Depends(requiere_rol("admin"))]
AdminOAnalista = Annotated[Usuario, Depends(requiere_rol("admin", "analista"))]
