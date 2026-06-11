"""Tolerancia de cobro: cierra cuota si la diferencia esta dentro del umbral."""

from decimal import Decimal

from nexocred_core.modelos import ResultadoTolerancia
from nexocred_core.money import CERO, restar


def aplicar_tolerancia(
    cuota_exigible: Decimal,
    monto_pagado: Decimal,
    tolerancia: Decimal,
) -> ResultadoTolerancia:
    faltante = restar(cuota_exigible, monto_pagado)
    diferencia = faltante if faltante > CERO else CERO
    dentro = diferencia <= tolerancia
    ajuste = diferencia if dentro else CERO
    return ResultadoTolerancia(
        dentro_de_tolerancia=dentro,
        diferencia=diferencia,
        ajuste=ajuste,
        cuota_cerrada=dentro,
    )
