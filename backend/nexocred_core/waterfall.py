"""Waterfall de imputacion de pagos en el orden obligatorio de spec 5.4."""

from decimal import Decimal

from nexocred_core.modelos import (
    ConceptoImputacion,
    EntradaPago,
    Imputacion,
    ModoPago,
    ResultadoPago,
    SaldoExigible,
)
from nexocred_core.money import CERO

_MODOS_CANCELATORIOS = {ModoPago.CANCELACION_ANTICIPADA, ModoPago.NOVACION}


def aplicar_pago(saldo: SaldoExigible, entrada: EntradaPago) -> ResultadoPago:
    restante = entrada.monto
    imputaciones: list[Imputacion] = []

    def imputar(
        concepto: ConceptoImputacion, disponible: Decimal, orden: int, cuota: int | None
    ) -> None:
        nonlocal restante
        if restante <= CERO or disponible <= CERO:
            return
        monto = min(restante, disponible)
        imputaciones.append(Imputacion(concepto, monto, orden, cuota_numero=cuota))
        restante = restante - monto

    # Pasos 1-3 por cuota vencida, mas antigua primero
    for cuota in sorted(saldo.cuotas, key=lambda c: c.vencimiento):
        imputar(ConceptoImputacion.PUNITORIO_VENCIDO, cuota.punitorio, 1, cuota.numero)
        imputar(ConceptoImputacion.INTERES_VENCIDO, cuota.interes, 2, cuota.numero)
        imputar(ConceptoImputacion.CAPITAL_VENCIDO, cuota.capital, 3, cuota.numero)

    # Paso 4: cargos exigibles -> no modelados como saldo en el core por ahora (sin datos)

    # Pasos 5-6: solo en modo cancelatorio/novacion
    if entrada.modo in _MODOS_CANCELATORIOS:
        imputar(ConceptoImputacion.INTERES_NO_VENCIDO, saldo.interes_no_vencido, 5, None)
        imputar(ConceptoImputacion.CAPITAL_NO_VENCIDO, saldo.capital_no_vencido, 6, None)

    # Paso 7: excedente no aplicado
    excedente = restante if restante > CERO else CERO

    return ResultadoPago(
        entrada=entrada,
        imputaciones=tuple(imputaciones),
        excedente=excedente,
    )
