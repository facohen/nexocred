"""Calculo de cancelacion total anticipada (payoff) a una fecha de negocio."""

from datetime import date
from decimal import Decimal

from nexocred_core.errores import ImporteNegativoError
from nexocred_core.modelos import Cronograma, Imputacion, ResultadoPayoff
from nexocred_core.money import sumar
from nexocred_core.saldo import calcular_saldo_exigible


def calcular_payoff(
    cronograma: Cronograma,
    imputaciones: tuple[Imputacion, ...],
    fecha_negocio: date,
    tasa_punitorio_diario: Decimal,
) -> ResultadoPayoff:
    if tasa_punitorio_diario < Decimal("0"):
        raise ImporteNegativoError("tasa_punitorio_diario no puede ser negativa")
    saldo = calcular_saldo_exigible(cronograma, imputaciones, fecha_negocio, tasa_punitorio_diario)

    punitorio = sumar(*(c.punitorio for c in saldo.cuotas)) if saldo.cuotas else sumar()
    interes_vencido = sumar(*(c.interes for c in saldo.cuotas)) if saldo.cuotas else sumar()
    capital_vencido = sumar(*(c.capital for c in saldo.cuotas)) if saldo.cuotas else sumar()

    capital = sumar(capital_vencido, saldo.capital_no_vencido)
    interes = sumar(interes_vencido, saldo.interes_no_vencido)
    total = sumar(capital, interes, punitorio)

    return ResultadoPayoff(
        fecha_negocio=fecha_negocio,
        capital=capital,
        interes=interes,
        punitorio=punitorio,
        total=total,
    )
