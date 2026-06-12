import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.m03_prestamos.reconstruccion import (
    cronograma_desde_cuotas,
    imputaciones_core,
)
from app.m07_riesgo.metricas import PrestamoRiesgo
from app.modelos_stub import Cuota, Imputacion, Pago, Prestamo
from nexocred_core import CERO, calcular_saldo_exigible


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


async def snapshot_prestamo(
    session: AsyncSession, prestamo: Prestamo, fecha: date
) -> PrestamoRiesgo:
    """Construye el snapshot puro de riesgo: capital pendiente outstanding y dias de
    atraso del tramo vencido mas antiguo con saldo exigible."""
    cuotas = await _cuotas(session, prestamo.id)
    capital_pendiente = CERO
    dias_atraso = 0
    if cuotas:
        crono = cronograma_desde_cuotas(cuotas)
        imps = imputaciones_core(await _imputaciones(session, prestamo.id))
        tasa_pun = prestamo.tasa_punitorio_diario or CERO
        saldo = calcular_saldo_exigible(crono, imps, fecha, tasa_pun)
        # capital outstanding = capital vencido pendiente + capital no vencido
        capital_vencido = (
            sum((c.capital for c in saldo.cuotas), CERO) if saldo.cuotas else CERO
        )
        capital_pendiente = capital_vencido + saldo.capital_no_vencido
        # dias de atraso = del tramo vencido mas antiguo con capital pendiente
        vencidas = [c for c in saldo.cuotas if c.capital > CERO]
        if vencidas:
            mas_antigua = min(vencidas, key=lambda c: c.vencimiento)
            dias_atraso = (fecha - mas_antigua.vencimiento).days

    snap = prestamo.snapshot_terminos or {}
    fecha_orig = prestamo.fecha_desembolso
    return PrestamoRiesgo(
        prestamo_id=str(prestamo.id),
        capital_pendiente=capital_pendiente,
        dias_atraso=dias_atraso,
        fecha_originacion=fecha_orig,
        cliente_id=str(prestamo.persona_id),
        vendedor_id=str(prestamo.vendedor_id) if prestamo.vendedor_id else None,
        producto_id=str(prestamo.producto_id),
        zona=str(snap.get("zona")) if snap.get("zona") else None,
        refinanciado=bool(snap.get("refinanciado", False)),
    )


async def cartera_riesgo(
    session: AsyncSession, fecha: date | None = None
) -> list[PrestamoRiesgo]:
    fecha = fecha or date.today()
    res = await session.execute(
        select(Prestamo).where(Prestamo.estado.in_(["vigente", "en_mora"]))
    )
    prestamos = list(res.scalars().all())
    snaps = []
    for p in prestamos:
        snap = await snapshot_prestamo(session, p, fecha)
        if snap.capital_pendiente > CERO:
            snaps.append(snap)
    return snaps
