from datetime import date
from decimal import Decimal

from nexocred_core.modelos import (
    ConceptoImputacion,
    EntradaPago,
    EstadoCuotaExigible,
    ModoPago,
    SaldoExigible,
)
from nexocred_core.waterfall import aplicar_pago


def _saldo_una_cuota(punitorio="50.00", interes="200.00", capital="2000.00"):
    return SaldoExigible(
        fecha_negocio=date(2026, 1, 20),
        cuotas=(
            EstadoCuotaExigible(
                numero=1,
                vencimiento=date(2026, 1, 10),
                punitorio=Decimal(punitorio),
                interes=Decimal(interes),
                capital=Decimal(capital),
            ),
        ),
        capital_no_vencido=Decimal("8000.00"),
        interes_no_vencido=Decimal("800.00"),
    )


def _conceptos(res):
    return [(i.concepto, i.monto) for i in res.imputaciones]


def test_conservacion_imputado_mas_excedente_igual_monto():
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("2250.00"), date(2026, 1, 20)))
    assert res.total_imputado + res.excedente == Decimal("2250.00")


def test_pago_exacto_liquida_en_orden():
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("2250.00"), date(2026, 1, 20)))
    assert _conceptos(res) == [
        (ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("50.00")),
        (ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00")),
        (ConceptoImputacion.CAPITAL_VENCIDO, Decimal("2000.00")),
    ]
    assert res.excedente == Decimal("0.00")


def test_pago_parcial_menor_al_punitorio():
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("30.00"), date(2026, 1, 20)))
    assert _conceptos(res) == [(ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("30.00"))]
    assert res.excedente == Decimal("0.00")


def test_pago_parcial_cruza_conceptos():
    # 50 punitorio + 200 interes + 100 de capital
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("350.00"), date(2026, 1, 20)))
    assert _conceptos(res) == [
        (ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("50.00")),
        (ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00")),
        (ConceptoImputacion.CAPITAL_VENCIDO, Decimal("100.00")),
    ]


def test_pago_mayor_al_exigible_genera_excedente_en_modo_normal():
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("3000.00"), date(2026, 1, 20)))
    assert res.excedente == Decimal("750.00")  # 3000 - 2250
    assert all(i.concepto is not ConceptoImputacion.CAPITAL_NO_VENCIDO for i in res.imputaciones)


def test_cancelacion_anticipada_imputa_no_vencido():
    entrada = EntradaPago(
        Decimal("11050.00"), date(2026, 1, 20), modo=ModoPago.CANCELACION_ANTICIPADA
    )
    res = aplicar_pago(_saldo_una_cuota(), entrada)
    conceptos = {i.concepto for i in res.imputaciones}
    assert ConceptoImputacion.INTERES_NO_VENCIDO in conceptos
    assert ConceptoImputacion.CAPITAL_NO_VENCIDO in conceptos
    # 50+200+2000 exigible + 800 int no venc + 8000 cap no venc = 11050
    assert res.excedente == Decimal("0.00")
    assert res.total_imputado == Decimal("11050.00")


def test_pago_anticipado_no_cancelatorio_no_toca_no_vencido():
    saldo = SaldoExigible(
        fecha_negocio=date(2026, 1, 5),
        cuotas=(),
        capital_no_vencido=Decimal("10000.00"),
        interes_no_vencido=Decimal("1000.00"),
    )
    res = aplicar_pago(saldo, EntradaPago(Decimal("500.00"), date(2026, 1, 5)))
    assert res.excedente == Decimal("500.00")
    assert res.imputaciones == () or all(
        i.concepto is ConceptoImputacion.EXCEDENTE for i in res.imputaciones
    )
