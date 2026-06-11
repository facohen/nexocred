import json
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.m15_catalogo.modelos import (
    GastoOriginacion,
    MatrizComision,
    MatrizTasa,
    PerfilPricing,
    ProductoCredito,
    ProductoVersion,
)
from app.m15_catalogo.schemas import (
    CeldaComisionIn,
    CeldaTasaIn,
    ProductoCreate,
    SimuladorInternoIn,
    SimuladorLibreIn,
    SimuladorOut,
)
from nexocred_core import Periodicidad, TerminosPrestamo, calcular_cronograma


def _plazos_to_csv(plazos: list[int]) -> str:
    return ",".join(str(p) for p in plazos)


def _csv_to_plazos(csv: str | None) -> list[int]:
    if not csv:
        return []
    return [int(x) for x in csv.split(",") if x.strip()]


async def crear_producto(
    session: AsyncSession, datos: ProductoCreate, *, actor_id: uuid.UUID | None
) -> ProductoCredito:
    producto = ProductoCredito(
        nombre=datos.nombre, descripcion=datos.descripcion, estado="borrador",
        version_vigente=1,
    )
    session.add(producto)
    await session.flush()

    version = ProductoVersion(
        producto_id=producto.id,
        version=1,
        periodicidad=datos.periodicidad,
        plazos_permitidos=_plazos_to_csv(datos.plazos_permitidos),
        monto_minimo=datos.monto_minimo,
        monto_maximo=datos.monto_maximo,
        creada_por=actor_id,
    )
    session.add(version)
    for g in datos.gastos:
        session.add(GastoOriginacion(producto_id=producto.id, **g.model_dump()))
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="producto_alta", entidad="producto_credito",
        entidad_id=producto.id, metadata_json={"nombre": datos.nombre},
    )
    return producto


async def obtener_producto(
    session: AsyncSession, producto_id: uuid.UUID
) -> ProductoCredito | None:
    res = await session.execute(
        select(ProductoCredito).where(ProductoCredito.id == producto_id)
    )
    return res.scalar_one_or_none()


async def version_vigente(
    session: AsyncSession, producto: ProductoCredito
) -> ProductoVersion | None:
    res = await session.execute(
        select(ProductoVersion).where(
            ProductoVersion.producto_id == producto.id,
            ProductoVersion.version == producto.version_vigente,
        )
    )
    return res.scalar_one_or_none()


async def gastos_de(
    session: AsyncSession, producto_id: uuid.UUID
) -> list[GastoOriginacion]:
    res = await session.execute(
        select(GastoOriginacion).where(GastoOriginacion.producto_id == producto_id)
    )
    return list(res.scalars().all())


async def actualizar_producto(
    session: AsyncSession,
    producto: ProductoCredito,
    cambios: dict,
    *,
    actor_id: uuid.UUID | None,
) -> ProductoCredito:
    if "nombre" in cambios and cambios["nombre"] is not None:
        producto.nombre = cambios["nombre"]
    if "descripcion" in cambios and cambios["descripcion"] is not None:
        producto.descripcion = cambios["descripcion"]

    actual = await version_vigente(session, producto)
    nueva_version = producto.version_vigente + 1
    nueva = ProductoVersion(
        producto_id=producto.id,
        version=nueva_version,
        periodicidad=cambios.get("periodicidad")
        or (actual.periodicidad if actual else "mensual"),
        plazos_permitidos=(
            _plazos_to_csv(cambios["plazos_permitidos"])
            if cambios.get("plazos_permitidos") is not None
            else (actual.plazos_permitidos if actual else None)
        ),
        monto_minimo=cambios.get("monto_minimo")
        if cambios.get("monto_minimo") is not None
        else (actual.monto_minimo if actual else None),
        monto_maximo=cambios.get("monto_maximo")
        if cambios.get("monto_maximo") is not None
        else (actual.monto_maximo if actual else None),
        creada_por=actor_id,
    )
    session.add(nueva)
    producto.version_vigente = nueva_version
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="producto_modificacion",
        entidad="producto_credito", entidad_id=producto.id,
        metadata_json={"version": nueva_version},
    )
    return producto


async def publicar_producto(
    session: AsyncSession, producto: ProductoCredito, *, actor_id: uuid.UUID | None
) -> ProductoCredito:
    if producto.estado == "activo":
        raise ErrorAPI("transicion_invalida", "el producto ya esta activo", status=409)
    producto.estado = "activo"
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="producto_publicacion",
        entidad="producto_credito", entidad_id=producto.id,
    )
    return producto


async def listar_productos(session: AsyncSession) -> list[ProductoCredito]:
    res = await session.execute(select(ProductoCredito).order_by(ProductoCredito.nombre))
    return list(res.scalars().all())


# ---------- perfiles ----------
async def crear_perfil(
    session: AsyncSession, nombre: str, descripcion: str | None, orden: int,
    *, actor_id: uuid.UUID | None,
) -> PerfilPricing:
    existente = await session.execute(
        select(PerfilPricing).where(PerfilPricing.nombre == nombre)
    )
    if existente.scalar_one_or_none() is not None:
        raise ErrorAPI("perfil_duplicado", "ya existe un perfil con ese nombre", status=409)
    perfil = PerfilPricing(nombre=nombre, descripcion=descripcion, orden=orden)
    session.add(perfil)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="perfil_alta", entidad="perfil_pricing",
        entidad_id=perfil.id,
    )
    return perfil


async def listar_perfiles(session: AsyncSession) -> list[PerfilPricing]:
    res = await session.execute(select(PerfilPricing).order_by(PerfilPricing.orden))
    return list(res.scalars().all())


# ---------- matrices ----------
async def upsert_matriz_tasas(
    session: AsyncSession, celdas: list[CeldaTasaIn], *, actor_id: uuid.UUID | None
) -> list[MatrizTasa]:
    for c in celdas:
        stmt = (
            pg_insert(MatrizTasa)
            .values(
                producto_id=c.producto_id, perfil_id=c.perfil_id, plazo=c.plazo,
                tasa=c.tasa,
            )
            .on_conflict_do_update(
                constraint="matriz_tasa_uq", set_={"tasa": c.tasa}
            )
        )
        await session.execute(stmt)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="matriz_tasa_modificacion",
        entidad="matriz_tasa", metadata_json={"celdas": len(celdas)},
    )
    return await listar_matriz_tasas(session)


async def listar_matriz_tasas(session: AsyncSession) -> list[MatrizTasa]:
    res = await session.execute(select(MatrizTasa))
    return list(res.scalars().all())


async def upsert_matriz_comisiones(
    session: AsyncSession, celdas: list[CeldaComisionIn], *, actor_id: uuid.UUID | None
) -> list[MatrizComision]:
    for c in celdas:
        stmt = (
            pg_insert(MatrizComision)
            .values(producto_id=c.producto_id, perfil_id=c.perfil_id, comision=c.comision)
            .on_conflict_do_update(
                constraint="matriz_comision_uq", set_={"comision": c.comision}
            )
        )
        await session.execute(stmt)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="matriz_comision_modificacion",
        entidad="matriz_comision", metadata_json={"celdas": len(celdas)},
    )
    return await listar_matriz_comisiones(session)


async def listar_matriz_comisiones(session: AsyncSession) -> list[MatrizComision]:
    res = await session.execute(select(MatrizComision))
    return list(res.scalars().all())


# ---------- simuladores (delegan al core) ----------
def _periodicidad(valor: str) -> Periodicidad:
    try:
        return Periodicidad(valor)
    except ValueError as exc:
        raise ErrorAPI(
            "periodicidad_invalida",
            f"periodicidad no soportada: {valor}",
            status=422,
        ) from exc


def _simular(datos: SimuladorLibreIn) -> SimuladorOut:
    terminos = TerminosPrestamo(
        capital=datos.capital,
        tasa_interes_directo=datos.tasa_interes_directo,
        cantidad_cuotas=datos.cantidad_cuotas,
        periodicidad=_periodicidad(datos.periodicidad),
        fecha_primera_cuota=datos.fecha_primera_cuota,
    )
    crono = calcular_cronograma(terminos)
    return SimuladorOut(
        capital=datos.capital,
        tasa_interes_directo=datos.tasa_interes_directo,
        cantidad_cuotas=datos.cantidad_cuotas,
        periodicidad=datos.periodicidad,
        total_capital=crono.total_capital,
        total_interes=crono.total_interes,
        total_a_pagar=crono.total_a_pagar,
        cuotas=[
            {
                "numero": f.numero,
                "vencimiento": f.vencimiento,
                "capital": f.capital,
                "interes": f.interes,
                "cuota": f.cuota,
            }
            for f in crono.filas
        ],  # type: ignore[list-item]
    )


def simular_libre(datos: SimuladorLibreIn) -> SimuladorOut:
    return _simular(datos)


async def resolver_tasa(
    session: AsyncSession, producto_id: uuid.UUID, perfil_id: uuid.UUID, plazo: int
):
    res = await session.execute(
        select(MatrizTasa.tasa).where(
            MatrizTasa.producto_id == producto_id,
            MatrizTasa.perfil_id == perfil_id,
            MatrizTasa.plazo == plazo,
        )
    )
    return res.scalar_one_or_none()


async def simular_interno(
    session: AsyncSession, datos: SimuladorInternoIn
) -> SimuladorOut:
    tasa = await resolver_tasa(
        session, datos.producto_id, datos.perfil_id, datos.cantidad_cuotas
    )
    if tasa is None:
        raise ErrorAPI(
            "tasa_no_definida",
            "no hay tasa en la matriz para ese producto/perfil/plazo",
            status=422,
        )
    libre = SimuladorLibreIn(
        capital=datos.capital,
        tasa_interes_directo=tasa,
        cantidad_cuotas=datos.cantidad_cuotas,
        periodicidad=datos.periodicidad,
        fecha_primera_cuota=datos.fecha_primera_cuota,
    )
    return _simular(libre)


def snapshot_producto_json(producto: ProductoCredito) -> str:
    return json.dumps({"nombre": producto.nombre, "estado": producto.estado})
