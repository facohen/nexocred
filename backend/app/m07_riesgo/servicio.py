import uuid
from collections import defaultdict
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


def _snapshot_desde_bulk(
    prestamo: Prestamo,
    cuotas: list[Cuota],
    imputaciones: list[Imputacion],
    fecha: date,
) -> PrestamoRiesgo:
    """Computa el snapshot de riesgo con datos ya cargados en memoria (sin I/O)."""
    capital_pendiente = CERO
    dias_atraso = 0
    if cuotas:
        crono = cronograma_desde_cuotas(cuotas)
        imps = imputaciones_core(imputaciones)
        tasa_pun = prestamo.tasa_punitorio_diario or CERO
        saldo = calcular_saldo_exigible(crono, imps, fecha, tasa_pun)
        capital_vencido = (
            sum((c.capital for c in saldo.cuotas), CERO) if saldo.cuotas else CERO
        )
        capital_pendiente = capital_vencido + saldo.capital_no_vencido
        vencidas = [c for c in saldo.cuotas if c.capital > CERO]
        if vencidas:
            mas_antigua = min(vencidas, key=lambda c: c.vencimiento)
            dias_atraso = (fecha - mas_antigua.vencimiento).days

    snap = prestamo.snapshot_terminos or {}
    return PrestamoRiesgo(
        prestamo_id=str(prestamo.id),
        capital_pendiente=capital_pendiente,
        dias_atraso=dias_atraso,
        fecha_originacion=prestamo.fecha_desembolso,
        cliente_id=str(prestamo.persona_id),
        vendedor_id=str(prestamo.vendedor_id) if prestamo.vendedor_id else None,
        producto_id=str(prestamo.producto_id),
        zona=str(snap.get("zona")) if snap.get("zona") else None,
        refinanciado=bool(snap.get("refinanciado", False)),
    )


async def snapshot_prestamo(
    session: AsyncSession, prestamo: Prestamo, fecha: date
) -> PrestamoRiesgo:
    """Snapshot de un préstamo individual. Usar solo fuera del path HTTP masivo."""
    cuotas_res = await session.execute(
        select(Cuota).where(Cuota.prestamo_id == prestamo.id).order_by(Cuota.numero)
    )
    cuotas = list(cuotas_res.scalars().all())
    imps_res = await session.execute(
        select(Imputacion)
        .join(Pago, Imputacion.pago_id == Pago.id)
        .where(Pago.prestamo_id == prestamo.id)
    )
    imputaciones = list(imps_res.scalars().all())
    return _snapshot_desde_bulk(prestamo, cuotas, imputaciones, fecha)


async def cartera_riesgo(
    session: AsyncSession,
    fecha: date | None = None,
    zona_id: uuid.UUID | None = None,
    sector_id: uuid.UUID | None = None,
    zona: str | None = None,
    sector: str | None = None,
) -> list[PrestamoRiesgo]:
    """Carga la cartera activa en 3 queries fijas (préstamos + cuotas + imputaciones)
    en lugar del patrón N+1 anterior (1 + 2·N queries por préstamo).

    Filtros opcionales:
    - zona_id / sector_id: UUID (legacy, filtra snapshot_terminos por UUID string)
    - zona / sector: código de texto (snapshot_terminos almacena el código como string)
    """
    fecha = fecha or date.today()

    # Query 1: préstamos activos con filtros de zona/sector via JSONB
    stmt = select(Prestamo).where(
        Prestamo.estado.in_(["vigente", "en_mora"]),
        Prestamo.fecha_desembolso <= fecha,
    )
    # Filtro por UUID (legacy)
    if zona_id is not None:
        stmt = stmt.where(
            Prestamo.snapshot_terminos["zona"].astext == str(zona_id)
        )
    if sector_id is not None:
        stmt = stmt.where(
            Prestamo.snapshot_terminos["sector"].astext == str(sector_id)
        )
    # Filtro por código de texto (snapshot almacena el código directamente)
    if zona is not None:
        stmt = stmt.where(
            Prestamo.snapshot_terminos["zona"].astext == zona
        )
    if sector is not None:
        stmt = stmt.where(
            Prestamo.snapshot_terminos["sector"].astext == sector
        )
    prestamos = list((await session.execute(stmt)).scalars().all())
    if not prestamos:
        return []

    ids = [p.id for p in prestamos]

    # Query 2: todas las cuotas de esos préstamos en una sola pasada
    cuotas_res = await session.execute(
        select(Cuota)
        .where(Cuota.prestamo_id.in_(ids))
        .order_by(Cuota.prestamo_id, Cuota.numero)
    )
    cuotas_por_prestamo: dict[uuid.UUID, list[Cuota]] = defaultdict(list)
    for c in cuotas_res.scalars().all():
        cuotas_por_prestamo[c.prestamo_id].append(c)

    # Query 3: todas las imputaciones de esos préstamos en una sola pasada
    imps_res = await session.execute(
        select(Imputacion)
        .join(Pago, Imputacion.pago_id == Pago.id)
        .where(Pago.prestamo_id.in_(ids))
    )
    imps_por_prestamo: dict[uuid.UUID, list[Imputacion]] = defaultdict(list)
    for i in imps_res.scalars().all():
        imps_por_prestamo[i.pago.prestamo_id].append(i)

    result = []
    for p in prestamos:
        snap = _snapshot_desde_bulk(
            p,
            cuotas_por_prestamo[p.id],
            imps_por_prestamo[p.id],
            fecha,
        )
        if snap.capital_pendiente > CERO:
            result.append(snap)
    return result
