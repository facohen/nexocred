"""Job snapshot_cartera: agrega el estado de la cartera a una fecha de corte.

Funcion pura/transaccional `generar_snapshot` (testeable directo) + task Celery
delgada. Idempotente por `fecha_corte` (UPSERT sobre la unique constraint).
Dinero en Decimal; nunca float; nunca now() para fechas de negocio.
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.m04_caja.servicio import posicion_consolidada
from app.m07_riesgo.servicio import cartera_riesgo
from app.modelos_stub import Imputacion, Pago, Prestamo, SnapshotCartera
from nexocred_core import CERO, redondear, sumar

_CONCEPTOS_INTERES = ("interes_vencido", "interes_no_vencido")
_CONCEPTOS_PUNITORIO = ("punitorio_vencido",)


def _fin_de_mes(d: date) -> date:
    if d.month == 12:
        return d.replace(month=12, day=31)
    primero_sig = d.replace(month=d.month + 1, day=1)
    return date.fromordinal(primero_sig.toordinal() - 1)


async def _suma_imputaciones(
    session: AsyncSession, conceptos: tuple[str, ...], desde: date, hasta: date
) -> Decimal:
    res = await session.execute(
        select(Imputacion.monto)
        .join(Pago, Imputacion.pago_id == Pago.id)
        .where(
            Imputacion.concepto.in_(conceptos),
            Pago.fecha_negocio >= desde,
            Pago.fecha_negocio <= hasta,
            Pago.estado != "anulado",
        )
    )
    montos = [m for (m,) in res.all() if m is not None]
    return redondear(sumar(*montos)) if montos else CERO


async def _colocacion_mes(
    session: AsyncSession, desde: date, hasta: date
) -> Decimal:
    res = await session.execute(
        select(Prestamo.monto_desembolsado, Prestamo.capital).where(
            Prestamo.fecha_desembolso >= desde,
            Prestamo.fecha_desembolso <= hasta,
        )
    )
    montos = [
        (md if md is not None else (cap or CERO)) for md, cap in res.all()
    ]
    return redondear(sumar(*montos)) if montos else CERO


async def generar_snapshot(
    session: AsyncSession, fecha_corte: date, *, actor_id: uuid.UUID | None
) -> SnapshotCartera:
    """Calcula y upserta UNA fila snapshot_cartera para `fecha_corte` (idempotente)."""
    inicio_mes = fecha_corte.replace(day=1)
    fin_mes = _fin_de_mes(fecha_corte)

    cartera = await cartera_riesgo(session, fecha_corte)
    prestamos_vigentes = len(cartera)
    prestamos_en_mora = sum(1 for c in cartera if c.dias_atraso > 0)

    colocacion = await _colocacion_mes(session, inicio_mes, fin_mes)
    intereses = await _suma_imputaciones(
        session, _CONCEPTOS_INTERES, inicio_mes, fin_mes
    )
    punitorios = await _suma_imputaciones(
        session, _CONCEPTOS_PUNITORIO, inicio_mes, fin_mes
    )
    capital_disponible, _ = await posicion_consolidada(session)

    valores = {
        "fecha_corte": fecha_corte,
        "prestamos_vigentes": prestamos_vigentes,
        "prestamos_en_mora": prestamos_en_mora,
        "colocacion_mes": colocacion,
        "intereses_cobrados_mes": intereses,
        "punitorios_cobrados_mes": punitorios,
        "capital_disponible": redondear(capital_disponible),
    }
    actualizables = {k: v for k, v in valores.items() if k != "fecha_corte"}

    stmt = (
        pg_insert(SnapshotCartera)
        .values(**valores)
        .on_conflict_do_update(
            constraint="snapshot_cartera_fecha_corte_uq", set_=actualizables
        )
        .returning(SnapshotCartera.id)
    )
    res = await session.execute(stmt)
    snap_id = res.scalar_one()

    await escribir_evento(
        session, actor_id=actor_id, accion="snapshot_generado",
        entidad="snapshot_cartera", entidad_id=snap_id,
        metadata_json={"fecha_corte": fecha_corte.isoformat()},
    )
    snap = await session.get(SnapshotCartera, snap_id)
    assert snap is not None
    await session.refresh(snap)
    return snap


def task_generar_snapshot(fecha_corte_iso: str) -> None:  # pragma: no cover
    """Task Celery delgada: abre una sesion, corre el job, commitea."""
    import asyncio

    from app.db import async_session_maker

    async def _run() -> None:
        async with async_session_maker() as session:
            await generar_snapshot(
                session, date.fromisoformat(fecha_corte_iso), actor_id=None
            )
            await session.commit()

    asyncio.run(_run())
