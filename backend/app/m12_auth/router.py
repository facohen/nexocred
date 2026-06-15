import uuid
from decimal import Decimal

import jwt
from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from app.auditoria import AuditoriaEvento, escribir_evento
from app.deps import AdminUser, CurrentUser, SessionDep
from app.errors import ErrorAPI
from app.m12_auth import servicio
from app.m12_auth.modelos import Usuario
from app.m12_auth.schemas import (
    AccessOut,
    AuditoriaOut,
    LoginIn,
    RefreshIn,
    TokenOut,
    UsuarioCreate,
    UsuarioOut,
    UsuarioUpdate,
)
from app.m12_auth.seguridad import (
    crear_access_token,
    crear_refresh_token,
    decodificar_token,
)
from app.paginacion import Pagina, paginar, paginar_query
# El store de parámetros vive en un módulo neutral (sin dependencias de router)
# para que los servicios lo lean sin invertir la jerarquía. Se re-exporta acá por
# compatibilidad con importadores existentes.
from app.parametros_globales import PARAMETROS_GLOBALES, costo_capital_anual

router = APIRouter()


def _usuario_out(u: Usuario) -> UsuarioOut:
    return UsuarioOut(
        id=u.id, email=u.email, nombre=u.nombre, activo=u.activo,
        roles=[r.nombre for r in u.roles],
    )


def _ctx(request: Request) -> dict:
    return {
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }


# ---------- AUTH ----------
@router.post("/auth/login", response_model=TokenOut, tags=["auth"])
async def login(datos: LoginIn, request: Request, session: SessionDep) -> TokenOut:
    usuario = await servicio.autenticar(session, datos.email, datos.password)
    if usuario is None:
        await escribir_evento(
            session, actor_id=None, accion="login", entidad="usuario",
            entidad_id=datos.email, resultado="fallido", **_ctx(request),
        )
        await session.commit()
        raise ErrorAPI("credenciales_invalidas", "email o password incorrectos", status=401)
    roles = [r.nombre for r in usuario.roles]
    await escribir_evento(
        session, actor_id=usuario.id, accion="login", entidad="usuario",
        entidad_id=usuario.id, resultado="ok", **_ctx(request),
    )
    await session.commit()
    return TokenOut(
        access_token=crear_access_token(usuario.id, roles),
        refresh_token=crear_refresh_token(usuario.id, roles),
    )


@router.post("/auth/refresh", response_model=AccessOut, tags=["auth"])
async def refresh(datos: RefreshIn, request: Request, session: SessionDep) -> AccessOut:
    try:
        payload = decodificar_token(datos.refresh_token)
    except jwt.PyJWTError as exc:
        await escribir_evento(
            session, actor_id=None, accion="refresh", entidad="usuario",
            resultado="fallido", **_ctx(request),
        )
        await session.commit()
        raise ErrorAPI("token_invalido", "refresh token invalido o expirado", status=401) \
            from exc
    if payload.get("type") != "refresh":
        await escribir_evento(
            session, actor_id=None, accion="refresh", entidad="usuario",
            resultado="fallido", **_ctx(request),
        )
        await session.commit()
        raise ErrorAPI("token_invalido", "se esperaba un refresh token", status=401)
    user_id = uuid.UUID(payload["sub"])
    usuario = await servicio.obtener_usuario(session, user_id)
    if usuario is None or not usuario.activo:
        raise ErrorAPI("token_invalido", "usuario inexistente o inactivo", status=401)
    roles = [r.nombre for r in usuario.roles]
    await escribir_evento(
        session, actor_id=usuario.id, accion="refresh", entidad="usuario",
        entidad_id=usuario.id, resultado="ok", **_ctx(request),
    )
    await session.commit()
    return AccessOut(access_token=crear_access_token(usuario.id, roles))


@router.post("/auth/logout", tags=["auth"])
async def logout(
    request: Request, session: SessionDep, usuario: CurrentUser
) -> dict[str, str]:
    await escribir_evento(
        session, actor_id=usuario.id, accion="logout", entidad="usuario",
        entidad_id=usuario.id, resultado="ok", **_ctx(request),
    )
    await session.commit()
    return {"estado": "ok"}


# ---------- USUARIOS ----------
@router.get("/usuarios", response_model=Pagina[UsuarioOut], tags=["usuarios"])
async def listar_usuarios(
    session: SessionDep,
    _: AdminUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[UsuarioOut]:
    res = await session.execute(select(Usuario))
    return paginar([_usuario_out(u) for u in res.scalars().all()], page, per_page)


@router.post(
    "/usuarios", response_model=UsuarioOut, status_code=201, tags=["usuarios"]
)
async def crear_usuario(
    datos: UsuarioCreate,
    session: SessionDep,
    actor: AdminUser,
) -> UsuarioOut:
    usuario = await servicio.crear_usuario(
        session, email=datos.email, nombre=datos.nombre, password=datos.password,
        roles=datos.roles, actor_id=actor.id,
    )
    await session.commit()
    await session.refresh(usuario)
    return _usuario_out(usuario)


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioOut, tags=["usuarios"])
async def actualizar_usuario(
    usuario_id: uuid.UUID,
    datos: UsuarioUpdate,
    session: SessionDep,
    actor: AdminUser,
) -> UsuarioOut:
    usuario = await servicio.obtener_usuario(session, usuario_id)
    if usuario is None:
        raise ErrorAPI("usuario_inexistente", "usuario no encontrado", status=404)
    if datos.nombre is not None:
        usuario.nombre = datos.nombre
    if datos.roles is not None:
        await servicio.asignar_roles(
            session, usuario=usuario, roles=datos.roles, actor_id=actor.id
        )
    await session.commit()
    await session.refresh(usuario)
    return _usuario_out(usuario)


@router.delete("/usuarios/{usuario_id}", tags=["usuarios"])
async def desactivar_usuario(
    usuario_id: uuid.UUID,
    session: SessionDep,
    actor: AdminUser,
) -> dict[str, str]:
    usuario = await servicio.obtener_usuario(session, usuario_id)
    if usuario is None:
        raise ErrorAPI("usuario_inexistente", "usuario no encontrado", status=404)
    await servicio.desactivar_usuario(session, usuario=usuario, actor_id=actor.id)
    await session.commit()
    return {"estado": "desactivado"}


# ---------- AUDITORIA ----------
@router.get("/auditoria", response_model=Pagina[AuditoriaOut], tags=["auditoria"])
async def listar_auditoria(
    session: SessionDep,
    _: AdminUser,
    accion: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> Pagina[AuditoriaOut]:
    q = select(AuditoriaEvento).order_by(AuditoriaEvento.created_at.desc())
    if accion:
        q = q.where(AuditoriaEvento.accion == accion)
    # Pagina en SQL (COUNT + LIMIT/OFFSET): no materializa toda la auditoría.
    return await paginar_query(session, q, AuditoriaOut.model_validate, page, per_page)


# ---------- PARAMETROS ----------
@router.get("/parametros", tags=["parametros"])
async def obtener_parametros(_: CurrentUser) -> dict:
    return dict(PARAMETROS_GLOBALES)


def _validar_costo_capital(valor: object) -> None:
    """costo_capital_anual debe ser un Decimal válido en (0, 1]; si no, 422 acá y
    no un InvalidOperation oscuro al calcular cashflow/DCF más tarde."""
    try:
        tasa = Decimal(str(valor))
    except (ArithmeticError, ValueError) as exc:
        raise ErrorAPI(
            "parametro_invalido", "costo_capital_anual debe ser numérico", status=422
        ) from exc
    if not (Decimal("0") < tasa <= Decimal("1")):
        raise ErrorAPI(
            "parametro_invalido",
            "costo_capital_anual debe estar en (0, 1]",
            status=422,
        )


@router.patch("/parametros", tags=["parametros"])
async def actualizar_parametros(
    cambios: dict,
    session: SessionDep,
    actor: AdminUser,
) -> dict:
    if "costo_capital_anual" in cambios:
        _validar_costo_capital(cambios["costo_capital_anual"])
    PARAMETROS_GLOBALES.update(cambios)
    await escribir_evento(
        session, actor_id=actor.id, accion="parametros_modificacion",
        entidad="parametros", metadata_json=cambios,
    )
    await session.commit()
    return dict(PARAMETROS_GLOBALES)
