"""Servicio M14 analytics: arma snapshots de rentabilidad desde el motor existente
(riesgo + imputaciones + comisiones + gastos de catalogo) y agrega por dimension.

LEE de los demas modulos; no muta nada. Dinero exacto (Decimal).
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.m07_riesgo.servicio import snapshot_prestamo
from app.m12_auth.router import costo_capital_anual
from app.m14_analytics.metricas import (
    AgregadoRentabilidad,
    PrestamoRentabilidad,
    agregar_por,
)
from app.m15_catalogo.modelos import GastoOriginacion
from app.modelos_stub import ComisionDevengo, Imputacion, Pago, Prestamo
from nexocred_core import CERO, redondear, sumar


# Conceptos de imputacion que representan interes cobrado (vencido y no vencido).
_CONCEPTOS_INTERES = ("interes_vencido", "interes_no_vencido")


async def _interes_cobrado_por_prestamo(
    session: AsyncSession,
) -> dict[uuid.UUID, Decimal]:
    """Suma de imputaciones de interes (vencido + no vencido) por prestamo: el
    interes realmente cobrado, via Pago→Imputacion."""
    res = await session.execute(
        select(Pago.prestamo_id, Imputacion.monto)
        .join(Imputacion, Imputacion.pago_id == Pago.id)
        .where(Imputacion.concepto.in_(_CONCEPTOS_INTERES))
    )
    out: dict[uuid.UUID, Decimal] = {}
    for prestamo_id, monto in res.all():
        out[prestamo_id] = sumar(out.get(prestamo_id, CERO), monto or CERO)
    return out


async def _comision_por_prestamo(session: AsyncSession) -> dict[uuid.UUID, Decimal]:
    """Comision de originacion neta por prestamo (devengos suman, clawbacks restan
    porque vienen con monto negativo o tipo clawback)."""
    res = await session.execute(
        select(ComisionDevengo.prestamo_id, ComisionDevengo.monto)
    )
    out: dict[uuid.UUID, Decimal] = {}
    for prestamo_id, monto in res.all():
        out[prestamo_id] = sumar(out.get(prestamo_id, CERO), monto or CERO)
    return out


async def _gastos_por_producto(session: AsyncSession) -> dict[uuid.UUID, list]:
    """Gastos de originacion activos agrupados por producto."""
    res = await session.execute(
        select(GastoOriginacion).where(GastoOriginacion.activo.is_(True))
    )
    out: dict[uuid.UUID, list] = {}
    for g in res.scalars().all():
        out.setdefault(g.producto_id, []).append(g)
    return out


def _gastos_de(prestamo: Prestamo, gastos_por_producto: dict[uuid.UUID, list]) -> Decimal:
    """Costo de gastos de originacion de un prestamo: fijos suman tal cual, los
    porcentuales se aplican sobre el capital desembolsado."""
    capital = prestamo.monto_desembolsado or prestamo.capital or CERO
    total = CERO
    for g in gastos_por_producto.get(prestamo.producto_id, []):
        if g.tipo == "porcentaje":
            total = sumar(total, capital * g.valor)
        else:  # 'fijo'
            total = sumar(total, g.valor)
    return redondear(total)


async def _snapshots(
    session: AsyncSession, fecha: date, desde: date | None, hasta: date | None
) -> list[PrestamoRentabilidad]:
    cond = [
        Prestamo.estado.in_(["vigente", "en_mora", "cancelado"]),
        Prestamo.fecha_desembolso <= fecha,
    ]
    if desde is not None:
        cond.append(Prestamo.fecha_desembolso >= desde)
    if hasta is not None:
        cond.append(Prestamo.fecha_desembolso <= hasta)
    res = await session.execute(select(Prestamo).where(*cond))
    prestamos = list(res.scalars().all())

    interes = await _interes_cobrado_por_prestamo(session)
    comision = await _comision_por_prestamo(session)
    gastos_pp = await _gastos_por_producto(session)

    salida: list[PrestamoRentabilidad] = []
    for p in prestamos:
        riesgo = await snapshot_prestamo(session, p, fecha)
        capital_des = redondear(p.monto_desembolsado or p.capital or CERO)
        dias_vida = (fecha - p.fecha_desembolso).days if p.fecha_desembolso else 0
        snap = p.snapshot_terminos or {}
        salida.append(
            PrestamoRentabilidad(
                prestamo_id=str(p.id),
                producto_id=str(p.producto_id),
                vendedor_id=str(p.vendedor_id) if p.vendedor_id else None,
                cliente_id=str(p.persona_id),
                cosecha=(
                    f"{p.fecha_desembolso.year:04d}-{p.fecha_desembolso.month:02d}"
                    if p.fecha_desembolso
                    else None
                ),
                zona=str(snap.get("zona")) if snap.get("zona") else None,
                capital_desembolsado=capital_des,
                interes_cobrado=redondear(interes.get(p.id, CERO)),
                comision_originacion=redondear(comision.get(p.id, CERO)),
                gastos_originacion=_gastos_de(p, gastos_pp),
                capital_pendiente=riesgo.capital_pendiente,
                dias_atraso=riesgo.dias_atraso,
                dias_vida=max(dias_vida, 0),
                refinanciado=riesgo.refinanciado,
            )
        )
    return salida


async def rentabilidad_por(
    session: AsyncSession,
    dimension: str,
    fecha: date,
    desde: date | None = None,
    hasta: date | None = None,
) -> list[AgregadoRentabilidad]:
    snaps = await _snapshots(session, fecha, desde, hasta)
    return agregar_por(snaps, dimension, costo_capital_anual())


async def resumen_cartera(session: AsyncSession, fecha: date) -> dict:
    """KPIs globales de rentabilidad de la cartera + top/bottom producto."""
    snaps = await _snapshots(session, fecha, None, None)
    tasa = costo_capital_anual()
    por_producto = agregar_por(snaps, "producto", tasa)

    capital = sumar(*(a.capital for a in por_producto)) if por_producto else CERO
    margen_neto = sumar(*(a.margen_neto for a in por_producto)) if por_producto else CERO
    pe = sumar(*(a.pe_monetaria for a in por_producto)) if por_producto else CERO
    rent = (margen_neto / capital).quantize(Decimal("0.0001")) if capital != CERO else CERO

    return {
        "capital_total": redondear(capital),
        "margen_neto_total": redondear(margen_neto),
        "pe_monetaria_total": redondear(pe),
        "rentabilidad_global": rent,
        "n_prestamos": sum(a.n_prestamos for a in por_producto),
        "mejor_producto": por_producto[0].clave if por_producto else None,
        "peor_producto": por_producto[-1].clave if por_producto else None,
    }
