import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.errors import ErrorAPI
from app.locking import bloquear_caja
from app.m04_caja.modelos import ArqueoCaja, Caja
from app.modelos_stub import MovimientoCaja
from nexocred_core import redondear, restar, sumar


async def crear_caja(
    session: AsyncSession, nombre: str, tipo: str | None, *, actor_id: uuid.UUID | None
) -> Caja:
    caja = Caja(nombre=nombre, tipo=tipo, saldo_teorico=Decimal("0"))
    session.add(caja)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="caja_alta", entidad="caja",
        entidad_id=caja.id,
    )
    return caja


async def listar_cajas(session: AsyncSession) -> list[Caja]:
    res = await session.execute(select(Caja).order_by(Caja.nombre))
    return list(res.scalars().all())


async def obtener_caja(session: AsyncSession, caja_id: uuid.UUID) -> Caja | None:
    res = await session.execute(select(Caja).where(Caja.id == caja_id))
    return res.scalar_one_or_none()


def _delta(tipo: str, monto: Decimal) -> Decimal:
    if tipo == "ingreso":
        return monto
    if tipo == "egreso":
        return -monto
    raise ErrorAPI("tipo_movimiento_invalido", f"tipo invalido: {tipo}", status=422)


async def registrar_movimiento(
    session: AsyncSession,
    caja: Caja,
    *,
    tipo: str,
    monto: Decimal,
    fecha_negocio: date,
    concepto: str | None = None,
    categoria: str | None = None,
    referencia: str | None = None,
    pago_id: uuid.UUID | None = None,
    contraparte_caja_id: uuid.UUID | None = None,
) -> MovimientoCaja:
    """Asienta un movimiento append-only y actualiza saldo_teorico de la caja (ya bloqueada)."""
    if monto < Decimal("0"):
        raise ErrorAPI("monto_negativo", "el monto no puede ser negativo", status=422)
    mov = MovimientoCaja(
        caja_id=caja.id,
        tipo=tipo,
        monto=monto,
        fecha_negocio=fecha_negocio,
        concepto=concepto,
        categoria=categoria,
        referencia=referencia,
        pago_id=pago_id,
        contraparte_caja_id=contraparte_caja_id,
    )
    session.add(mov)
    caja.saldo_teorico = redondear(sumar(caja.saldo_teorico, _delta(tipo, monto)))
    await session.flush()
    return mov


async def movimiento_manual(
    session: AsyncSession,
    caja_id: uuid.UUID,
    *,
    tipo: str,
    monto: Decimal,
    fecha_negocio: date,
    concepto: str | None,
    categoria: str | None,
    referencia: str | None,
    actor_id: uuid.UUID | None,
) -> MovimientoCaja:
    caja = await bloquear_caja(session, caja_id)
    mov = await registrar_movimiento(
        session, caja, tipo=tipo, monto=monto, fecha_negocio=fecha_negocio,
        concepto=concepto, categoria=categoria, referencia=referencia,
    )
    await escribir_evento(
        session, actor_id=actor_id, accion="caja_movimiento_manual",
        entidad="movimiento_caja", entidad_id=mov.id,
        metadata_json={"tipo": tipo, "monto": str(monto)},
    )
    return mov


async def listar_movimientos(
    session: AsyncSession,
    caja_id: uuid.UUID,
    *,
    desde: date | None = None,
    hasta: date | None = None,
) -> list[MovimientoCaja]:
    stmt = select(MovimientoCaja).where(MovimientoCaja.caja_id == caja_id)
    if desde is not None:
        stmt = stmt.where(MovimientoCaja.fecha_negocio >= desde)
    if hasta is not None:
        stmt = stmt.where(MovimientoCaja.fecha_negocio <= hasta)
    stmt = stmt.order_by(MovimientoCaja.created_at)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def transferencia_interna(
    session: AsyncSession,
    *,
    caja_origen_id: uuid.UUID,
    caja_destino_id: uuid.UUID,
    monto: Decimal,
    fecha_negocio: date,
    concepto: str | None,
    actor_id: uuid.UUID | None,
) -> tuple[MovimientoCaja, MovimientoCaja]:
    if caja_origen_id == caja_destino_id:
        raise ErrorAPI(
            "transferencia_invalida", "origen y destino no pueden coincidir", status=422
        )
    # Lock determinista para evitar deadlocks (orden por id).
    ids = sorted([caja_origen_id, caja_destino_id], key=str)
    cajas = {}
    for cid in ids:
        cajas[cid] = await bloquear_caja(session, cid)
    origen = cajas[caja_origen_id]
    destino = cajas[caja_destino_id]
    egreso = await registrar_movimiento(
        session, origen, tipo="egreso", monto=monto, fecha_negocio=fecha_negocio,
        concepto=concepto, categoria="transferencia", contraparte_caja_id=destino.id,
    )
    ingreso = await registrar_movimiento(
        session, destino, tipo="ingreso", monto=monto, fecha_negocio=fecha_negocio,
        concepto=concepto, categoria="transferencia", contraparte_caja_id=origen.id,
    )
    await escribir_evento(
        session, actor_id=actor_id, accion="caja_transferencia",
        entidad="movimiento_caja", entidad_id=egreso.id,
        metadata_json={"origen": str(origen.id), "destino": str(destino.id),
                       "monto": str(monto)},
    )
    return egreso, ingreso


async def _arqueo_existente(
    session: AsyncSession, caja_id: uuid.UUID, fecha_negocio: date
) -> ArqueoCaja | None:
    res = await session.execute(
        select(ArqueoCaja).where(
            ArqueoCaja.caja_id == caja_id,
            ArqueoCaja.fecha_negocio == fecha_negocio,
        )
    )
    return res.scalar_one_or_none()


async def arqueo_pendiente(
    session: AsyncSession, caja_id: uuid.UUID, fecha_negocio: date
) -> dict:
    caja = await obtener_caja(session, caja_id)
    if caja is None:
        raise ErrorAPI("caja_no_encontrada", "caja inexistente", status=404)
    existente = await _arqueo_existente(session, caja_id, fecha_negocio)
    return {
        "caja_id": caja_id,
        "fecha_negocio": fecha_negocio,
        "saldo_teorico": caja.saldo_teorico,
        "cerrado": existente is not None,
    }


async def cerrar_arqueo(
    session: AsyncSession,
    caja_id: uuid.UUID,
    *,
    fecha_negocio: date,
    saldo_fisico: Decimal,
    actor_id: uuid.UUID | None,
) -> ArqueoCaja:
    caja = await bloquear_caja(session, caja_id)
    if await _arqueo_existente(session, caja_id, fecha_negocio) is not None:
        raise ErrorAPI(
            "arqueo_ya_cerrado",
            "el arqueo de esa caja/fecha ya esta cerrado y no se reabre",
            status=409,
        )
    diferencia = restar(saldo_fisico, caja.saldo_teorico)
    arqueo = ArqueoCaja(
        caja_id=caja_id,
        fecha_negocio=fecha_negocio,
        saldo_teorico=caja.saldo_teorico,
        saldo_fisico=saldo_fisico,
        diferencia=diferencia,
        cerrado_por=actor_id,
    )
    session.add(arqueo)
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="caja_arqueo", entidad="arqueo_caja",
        entidad_id=arqueo.id, metadata_json={"diferencia": str(diferencia)},
    )
    return arqueo


async def posicion_consolidada(session: AsyncSession) -> tuple[Decimal, list[Caja]]:
    cajas = await listar_cajas(session)
    total = sumar(*(c.saldo_teorico for c in cajas)) if cajas else Decimal("0")
    return total, cajas
