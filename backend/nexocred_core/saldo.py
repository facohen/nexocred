"""Calculo de saldo exigible por fecha de negocio. Puro."""

from datetime import date
from decimal import Decimal

from nexocred_core.errores import ImporteNegativoError
from nexocred_core.modelos import (
    ConceptoImputacion,
    Cronograma,
    EstadoCuotaExigible,
    Imputacion,
    SaldoExigible,
)
from nexocred_core.money import CERO, redondear, restar, sumar


def _imputado(
    imps: tuple[Imputacion, ...], cuota_numero: int, concepto: ConceptoImputacion
) -> Decimal:
    montos = [i.monto for i in imps if i.cuota_numero == cuota_numero and i.concepto is concepto]
    return sumar(*montos) if montos else CERO


def calcular_saldo_exigible(
    cronograma: Cronograma,
    imputaciones: tuple[Imputacion, ...],
    fecha_negocio: date,
    tasa_punitorio_diario: Decimal,
) -> SaldoExigible:
    if tasa_punitorio_diario < Decimal("0"):
        raise ImporteNegativoError("tasa_punitorio_diario no puede ser negativa")
    cuotas_exigibles: list[EstadoCuotaExigible] = []
    capital_no_vencido = CERO
    interes_no_vencido = CERO

    for fila in cronograma.filas:
        if fila.vencimiento <= fecha_negocio:
            capital_pend = restar(
                fila.capital,
                _imputado(imputaciones, fila.numero, ConceptoImputacion.CAPITAL_VENCIDO),
            )
            interes_pend = restar(
                fila.interes,
                _imputado(imputaciones, fila.numero, ConceptoImputacion.INTERES_VENCIDO),
            )
            capital_pend = max(capital_pend, CERO)
            interes_pend = max(interes_pend, CERO)

            dias_atraso = (fecha_negocio - fila.vencimiento).days
            punitorio_bruto = redondear(
                capital_pend * tasa_punitorio_diario * Decimal(dias_atraso)
            )
            punitorio_pagado = _imputado(
                imputaciones, fila.numero, ConceptoImputacion.PUNITORIO_VENCIDO
            )
            punitorio_pend = max(restar(punitorio_bruto, punitorio_pagado), CERO)

            cuotas_exigibles.append(
                EstadoCuotaExigible(
                    numero=fila.numero,
                    vencimiento=fila.vencimiento,
                    punitorio=punitorio_pend,
                    interes=interes_pend,
                    capital=capital_pend,
                )
            )
        else:
            capital_no_vencido = sumar(capital_no_vencido, fila.capital)
            interes_no_vencido = sumar(interes_no_vencido, fila.interes)

    return SaldoExigible(
        fecha_negocio=fecha_negocio,
        cuotas=tuple(cuotas_exigibles),
        capital_no_vencido=capital_no_vencido,
        interes_no_vencido=interes_no_vencido,
    )
