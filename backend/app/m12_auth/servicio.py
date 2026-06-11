import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.m12_auth.modelos import Rol, Usuario
from app.m12_auth.seguridad import hash_password, verificar_password


async def _roles_por_nombre(session: AsyncSession, nombres: list[str]) -> list[Rol]:
    if not nombres:
        return []
    res = await session.execute(select(Rol).where(Rol.nombre.in_(nombres)))
    roles = list(res.scalars().all())
    encontrados = {r.nombre for r in roles}
    faltantes = set(nombres) - encontrados
    if faltantes:
        raise ErrorAPI(
            "rol_inexistente", f"roles inexistentes: {sorted(faltantes)}", status=400
        )
    return roles


async def autenticar(session: AsyncSession, email: str, password: str) -> Usuario | None:
    res = await session.execute(select(Usuario).where(Usuario.email == email))
    usuario = res.scalar_one_or_none()
    if usuario is None or not usuario.activo:
        return None
    if not verificar_password(password, usuario.password_hash):
        return None
    return usuario


async def crear_usuario(
    session: AsyncSession,
    *,
    email: str,
    nombre: str,
    password: str,
    roles: list[str],
    actor_id: uuid.UUID | None,
) -> Usuario:
    existente = await session.execute(select(Usuario).where(Usuario.email == email))
    if existente.scalar_one_or_none() is not None:
        raise ErrorAPI("email_duplicado", "ya existe un usuario con ese email", status=409)
    roles_obj = await _roles_por_nombre(session, roles)
    usuario = Usuario(
        email=email, nombre=nombre, password_hash=hash_password(password)
    )
    usuario.roles = roles_obj
    session.add(usuario)
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="usuario_alta",
        entidad="usuario",
        entidad_id=usuario.id,
        metadata_json={"email": email, "roles": roles},
    )
    return usuario


async def asignar_roles(
    session: AsyncSession,
    *,
    usuario: Usuario,
    roles: list[str],
    actor_id: uuid.UUID | None,
) -> Usuario:
    roles_obj = await _roles_por_nombre(session, roles)
    usuario.roles = roles_obj
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="usuario_cambio_roles",
        entidad="usuario",
        entidad_id=usuario.id,
        metadata_json={"roles": roles},
    )
    return usuario


async def desactivar_usuario(
    session: AsyncSession, *, usuario: Usuario, actor_id: uuid.UUID | None
) -> Usuario:
    usuario.activo = False
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion="usuario_baja",
        entidad="usuario",
        entidad_id=usuario.id,
    )
    return usuario


async def obtener_usuario(session: AsyncSession, usuario_id: uuid.UUID) -> Usuario | None:
    res = await session.execute(select(Usuario).where(Usuario.id == usuario_id))
    return res.scalar_one_or_none()
