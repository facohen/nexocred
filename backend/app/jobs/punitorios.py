"""Job devengar_punitorios: calcula y persiste el punitorio acumulado por cuota.

Delega el calculo al core (`calcular_saldo_exigible` -> punitorio por tramo).
Idempotente: setea el VALOR ABSOLUTO computado en `cuota.punitorio_acumulado`,
no incrementa. Toma `fecha_corte` explicita (nunca now()).
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auditoria import escribir_evento
from app.m03_prestamos.reconstruccion import cronograma_desde_cuotas, imputaciones_core
from app.modelos_stub import Cuota, Imputacion, Pago, Prestamo
from nexocred_core import CERO, calcular_saldo_exigible, redondear


async def _cuotas(session: AsyncSession, prestamo_id: uuid.UUID) -> list[Cuota]:
    res = await session.execute(
        select(Cuota).where(Cuota.prestamo_id == prestamo_id).order_by(Cuota.numero)
    )
    return list(res.scalars().all())


async def _imputaciones(
    session: AsyncSession, prestamo_id: uuid.UUID
) -> list[Imputacion]:
    res = await session.execute(
        select(Imputacion)
        .join(Pago, Imputacion.pago_id == Pago.id)
        .where(Pago.prestamo_id == prestamo_id)
    )
    return list(res.scalars().all())


async def devengar_punitorios(
    session: AsyncSession, fecha_corte: date, *, actor_id: uuid.UUID | None
) -> int:
    """Recalcula y persiste punitorio_acumulado absoluto por cuota a `fecha_corte`.

    Devuelve la cantidad de cuotas tocadas.
    """
    res = await session.execute(
        select(Prestamo).where(Prestamo.estado.in_(["vigente", "en_mora"]))
    )
    prestamos = list(res.scalars().all())
    tocadas = 0
    for prestamo in prestamos:
        cuotas = await _cuotas(session, prestamo.id)
        if not cuotas:
            continue
        crono = cronograma_desde_cuotas(cuotas)
        imps = imputaciones_core(await _imputaciones(session, prestamo.id))
        tasa_pun = prestamo.tasa_punitorio_diario or CERO
        saldo = calcular_saldo_exigible(crono, imps, fecha_corte, tasa_pun)
        pun_por_numero = {c.numero: redondear(c.punitorio) for c in saldo.cuotas}
        for cuota in cuotas:
            nuevo = pun_por_numero.get(cuota.numero, CERO)
            if cuota.punitorio_acumulado != nuevo:
                cuota.punitorio_acumulado = nuevo
                tocadas += 1
    await session.flush()
    await escribir_evento(
        session, actor_id=actor_id, accion="punitorios_devengados",
        entidad="cuota", entidad_id=None,
        metadata_json={"fecha_corte": fecha_corte.isoformat(), "cuotas": tocadas},
    )
    return tocadas


from app.jobs.celery_app import celery_app  # noqa: E402


@celery_app.task(name="app.jobs.punitorios.task_devengar_punitorios")
def task_devengar_punitorios(fecha_corte_iso: str | None = None) -> None:  # pragma: no cover
    import asyncio

    from app.db import async_session_maker

    corte = date.fromisoformat(fecha_corte_iso) if fecha_corte_iso else date.today()

    async def _run() -> None:
        async with async_session_maker() as session:
            await devengar_punitorios(session, corte, actor_id=None)
            await session.commit()

    asyncio.run(_run())
