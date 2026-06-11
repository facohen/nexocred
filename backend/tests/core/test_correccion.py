from datetime import date
from decimal import Decimal

from nexocred_core.correccion import corregir_pago
from nexocred_core.modelos import (
    ConceptoImputacion,
    EntradaPago,
    Imputacion,
    ResultadoPago,
)


def _resultado_original():
    return ResultadoPago(
        entrada=EntradaPago(Decimal("2250.00"), date(2026, 1, 20)),
        imputaciones=(
            Imputacion(ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("50.00"), 1, cuota_numero=1),
            Imputacion(ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00"), 2, cuota_numero=1),
            Imputacion(ConceptoImputacion.CAPITAL_VENCIDO, Decimal("2000.00"), 3, cuota_numero=1),
        ),
        excedente=Decimal("0.00"),
    )


def _resultado_reemplazo():
    return ResultadoPago(
        entrada=EntradaPago(Decimal("250.00"), date(2026, 1, 20)),
        imputaciones=(
            Imputacion(ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("50.00"), 1, cuota_numero=1),
            Imputacion(ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00"), 2, cuota_numero=1),
        ),
        excedente=Decimal("0.00"),
    )


def test_reversas_niegan_cada_imputacion_original():
    res = corregir_pago(_resultado_original(), _resultado_reemplazo())
    assert len(res.reversas) == 3
    assert res.reversas[0].monto == Decimal("-50.00")
    assert res.reversas[1].monto == Decimal("-200.00")
    assert res.reversas[2].monto == Decimal("-2000.00")
    # conceptos y cuota preservados para trazabilidad
    assert res.reversas[0].concepto is ConceptoImputacion.PUNITORIO_VENCIDO
    assert res.reversas[2].cuota_numero == 1


def test_suma_reversas_anula_original():
    original = _resultado_original()
    res = corregir_pago(original, _resultado_reemplazo())
    suma_original = sum(i.monto for i in original.imputaciones)
    suma_reversas = sum(i.monto for i in res.reversas)
    assert suma_original + suma_reversas == Decimal("0.00")


def test_reemplazo_se_conserva_intacto():
    reemplazo = _resultado_reemplazo()
    res = corregir_pago(_resultado_original(), reemplazo)
    assert res.reemplazo is reemplazo
