import uuid
from datetime import date
from typing import Any, Type

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.m12_auth.modelos import Rol, Usuario, usuario_rol
from app.m16_maestros.modelos import (
    AsignacionVendedor,
    Canal,
    Disposicion,
    Localidad,
    Provincia,
    Sector,
    Tema,
    Zona,
)
from app.m16_maestros.schemas import (
    AsignacionVendedorIn,
    AsignacionVendedorOut,
    CatalogoCreate,
    CatalogoUpdate,
    DisposicionCreate,
    DisposicionUpdate,
    LocalidadCreate,
    LocalidadUpdate,
    ProvinciaCreate,
    ProvinciaUpdate,
    VendedorConAsignacionOut,
)


async def _guard_codigo(session: AsyncSession, Modelo: Any, codigo: str) -> None:
    res = await session.execute(select(Modelo).where(Modelo.codigo == codigo))
    if res.scalar_one_or_none() is not None:
        raise ErrorAPI("codigo_duplicado", f"ya existe un registro con codigo '{codigo}'", status=409)


async def crear_catalogo(
    session: AsyncSession,
    Modelo: Any,
    datos: CatalogoCreate,
    accion: str,
    *,
    actor_id: uuid.UUID | None,
) -> Any:
    await _guard_codigo(session, Modelo, datos.codigo)
    obj = Modelo(codigo=datos.codigo, nombre=datos.nombre, orden=datos.orden)
    session.add(obj)
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion=accion,
        entidad=Modelo.__tablename__,
        entidad_id=obj.id,
        metadata_json={"codigo": datos.codigo, "nombre": datos.nombre},
    )
    return obj


async def actualizar_catalogo(
    session: AsyncSession,
    obj: Any,
    cambios: CatalogoUpdate,
    accion: str,
    *,
    actor_id: uuid.UUID | None,
) -> Any:
    data = cambios.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(obj, k, v)
    await session.flush()
    await escribir_evento(
        session,
        actor_id=actor_id,
        accion=accion,
        entidad=obj.__tablename__,
        entidad_id=obj.id,
        metadata_json=data,
    )
    return obj


async def listar_catalogo(session: AsyncSession, Modelo: Any) -> list[Any]:
    res = await session.execute(select(Modelo).order_by(Modelo.orden, Modelo.nombre))
    return list(res.scalars().all())


async def obtener_por_id(session: AsyncSession, Modelo: Any, id: uuid.UUID) -> Any | None:
    res = await session.execute(select(Modelo).where(Modelo.id == id))
    return res.scalar_one_or_none()


# ---------- Disposicion (tiene genera_cobro) ----------

async def crear_disposicion(
    session: AsyncSession, datos: DisposicionCreate, *, actor_id: uuid.UUID | None
) -> Disposicion:
    await _guard_codigo(session, Disposicion, datos.codigo)
    obj = Disposicion(
        codigo=datos.codigo,
        nombre=datos.nombre,
        genera_cobro=datos.genera_cobro,
        orden=datos.orden,
    )
    session.add(obj)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="disposicion_alta",
        entidad="disposicion", entidad_id=obj.id,
        metadata_json={"codigo": datos.codigo},
    )
    return obj


async def actualizar_disposicion(
    session: AsyncSession, obj: Disposicion, cambios: DisposicionUpdate, *, actor_id: uuid.UUID | None
) -> Disposicion:
    data = cambios.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(obj, k, v)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="disposicion_modificacion",
        entidad="disposicion", entidad_id=obj.id, metadata_json=data,
    )
    return obj


# ---------- Provincia ----------

async def crear_provincia(
    session: AsyncSession, datos: ProvinciaCreate, *, actor_id: uuid.UUID | None
) -> Provincia:
    await _guard_codigo(session, Provincia, datos.codigo)
    obj = Provincia(codigo=datos.codigo, nombre=datos.nombre, orden=datos.orden)
    session.add(obj)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="provincia_alta",
        entidad="provincia", entidad_id=obj.id,
        metadata_json={"codigo": datos.codigo, "nombre": datos.nombre},
    )
    return obj


async def actualizar_provincia(
    session: AsyncSession, obj: Provincia, cambios: ProvinciaUpdate, *, actor_id: uuid.UUID | None
) -> Provincia:
    data = cambios.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(obj, k, v)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="provincia_modificacion",
        entidad="provincia", entidad_id=obj.id, metadata_json=data,
    )
    return obj


# ---------- Localidad ----------

async def _guard_localidad(session: AsyncSession, provincia_id: uuid.UUID, nombre: str) -> None:
    res = await session.execute(
        select(Localidad).where(
            Localidad.provincia_id == provincia_id,
            Localidad.nombre == nombre,
        )
    )
    if res.scalar_one_or_none() is not None:
        raise ErrorAPI("localidad_duplicada", f"ya existe '{nombre}' en esa provincia", status=409)


async def crear_localidad(
    session: AsyncSession, datos: LocalidadCreate, *, actor_id: uuid.UUID | None
) -> Localidad:
    prov = await obtener_por_id(session, Provincia, datos.provincia_id)
    if prov is None:
        raise ErrorAPI("provincia_no_encontrada", "provincia no existe", status=404)
    await _guard_localidad(session, datos.provincia_id, datos.nombre)
    obj = Localidad(
        provincia_id=datos.provincia_id,
        codigo=datos.codigo,
        nombre=datos.nombre,
    )
    session.add(obj)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="localidad_alta",
        entidad="localidad", entidad_id=obj.id,
        metadata_json={"nombre": datos.nombre, "provincia_id": str(datos.provincia_id)},
    )
    return obj


async def actualizar_localidad(
    session: AsyncSession, obj: Localidad, cambios: LocalidadUpdate, *, actor_id: uuid.UUID | None
) -> Localidad:
    data = cambios.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(obj, k, v)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="localidad_modificacion",
        entidad="localidad", entidad_id=obj.id, metadata_json=data,
    )
    return obj


async def listar_localidades(
    session: AsyncSession, provincia_id: uuid.UUID | None = None
) -> list[Localidad]:
    q = select(Localidad).order_by(Localidad.nombre)
    if provincia_id is not None:
        q = q.where(Localidad.provincia_id == provincia_id)
    res = await session.execute(q)
    return list(res.scalars().all())


# ---------- Asignación Vendedor ----------

async def _asignacion_vigente(
    session: AsyncSession, vendedor_id: uuid.UUID
) -> AsignacionVendedor | None:
    res = await session.execute(
        select(AsignacionVendedor).where(
            AsignacionVendedor.vendedor_id == vendedor_id,
            AsignacionVendedor.vigente_hasta.is_(None),
        )
    )
    return res.scalar_one_or_none()


async def asignar_vendedor(
    session: AsyncSession,
    vendedor_id: uuid.UUID,
    datos: AsignacionVendedorIn,
    *,
    actor_id: uuid.UUID | None,
) -> AsignacionVendedor:
    # Verificar que vendedor existe
    res = await session.execute(select(Usuario).where(Usuario.id == vendedor_id))
    if res.scalar_one_or_none() is None:
        raise ErrorAPI("vendedor_no_encontrado", "vendedor no existe", status=404)

    # Cerrar asignación vigente anterior
    vigente = await _asignacion_vigente(session, vendedor_id)
    if vigente is not None:
        vigente.vigente_hasta = datos.vigente_desde

    nueva = AsignacionVendedor(
        vendedor_id=vendedor_id,
        zona_id=datos.zona_id,
        sector_id=datos.sector_id,
        vigente_desde=datos.vigente_desde,
    )
    session.add(nueva)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="asignacion_vendedor_alta",
        entidad="asignacion_vendedor", entidad_id=nueva.id,
        metadata_json={
            "vendedor_id": str(vendedor_id),
            "zona_id": str(datos.zona_id),
            "sector_id": str(datos.sector_id),
        },
    )
    return nueva


async def listar_vendedores_con_asignacion(
    session: AsyncSession,
) -> list[VendedorConAsignacionOut]:
    rol_res = await session.execute(select(Rol).where(Rol.nombre == "vendedor"))
    rol = rol_res.scalar_one_or_none()
    if rol is None:
        return []

    res = await session.execute(
        select(Usuario)
        .join(usuario_rol, usuario_rol.c.usuario_id == Usuario.id)
        .where(usuario_rol.c.rol_id == rol.id, Usuario.activo == True)
        .order_by(Usuario.nombre)
    )
    usuarios = list(res.scalars().all())

    out = []
    for u in usuarios:
        asig = await _asignacion_vigente(session, u.id)
        asig_out = AsignacionVendedorOut.model_validate(asig) if asig else None
        out.append(
            VendedorConAsignacionOut(
                id=u.id,
                nombre=u.nombre,
                email=u.email,
                asignacion_vigente=asig_out,
            )
        )
    return out
