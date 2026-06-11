"""Los 8 casos borde minimos de spec 5.5. Contrato de cierre de Pre-F1."""

from datetime import date
from decimal import Decimal

from nexocred_core import (
    ConceptoImputacion,
    EntradaPago,
    ModoPago,
    Periodicidad,
    TerminosPrestamo,
    aplicar_pago,
    aplicar_tolerancia,
    calcular_cronograma,
    calcular_payoff,
    calcular_saldo_exigible,
    corregir_pago,
)

TASA_PUNITORIO = Decimal("0.001")


def _terminos():
    return TerminosPrestamo(
        capital=Decimal("10000.00"),
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=5,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
        tasa_punitorio_diario=TASA_PUNITORIO,
    )


def _saldo(fecha, imputaciones=()):
    return calcular_saldo_exigible(
        calcular_cronograma(_terminos()), imputaciones, fecha, TASA_PUNITORIO
    )


def test_caso_1_pago_exacto_de_cuota_vencida():
    # fecha de vencimiento exacta: cuota = 2200, punitorio 0
    saldo = _saldo(date(2026, 1, 10))
    res = aplicar_pago(saldo, EntradaPago(Decimal("2200.00"), date(2026, 1, 10)))
    assert res.excedente == Decimal("0.00")
    assert res.total_imputado == Decimal("2200.00")


def test_caso_2_pago_parcial_menor_al_punitorio():
    saldo = _saldo(date(2026, 1, 20))  # 10 dias atraso -> punitorio 20.00
    res = aplicar_pago(saldo, EntradaPago(Decimal("10.00"), date(2026, 1, 20)))
    assert [i.concepto for i in res.imputaciones] == [ConceptoImputacion.PUNITORIO_VENCIDO]
    assert res.imputaciones[0].monto == Decimal("10.00")


def test_caso_3_pago_parcial_cruza_conceptos():
    saldo = _saldo(date(2026, 1, 20))  # punitorio 20, interes 200, capital 2000
    res = aplicar_pago(saldo, EntradaPago(Decimal("100.00"), date(2026, 1, 20)))
    conceptos = [(i.concepto, i.monto) for i in res.imputaciones]
    assert conceptos == [
        (ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("20.00")),
        (ConceptoImputacion.INTERES_VENCIDO, Decimal("80.00")),
    ]


def test_caso_4_pago_mayor_al_exigible_registra_excedente():
    saldo = _saldo(date(2026, 1, 10))  # exigible 2200
    res = aplicar_pago(saldo, EntradaPago(Decimal("2500.00"), date(2026, 1, 10)))
    assert res.excedente == Decimal("300.00")


def test_caso_5_pago_anticipado_no_cancelatorio_no_imputa_no_vencido():
    saldo = _saldo(date(2026, 1, 5))  # nada vencido aun
    res = aplicar_pago(saldo, EntradaPago(Decimal("1000.00"), date(2026, 1, 5)))
    assert res.excedente == Decimal("1000.00")
    assert res.imputaciones == ()


def test_caso_6_cancelacion_anticipada_total():
    cronograma = calcular_cronograma(_terminos())
    payoff = calcular_payoff(cronograma, (), date(2026, 1, 9), TASA_PUNITORIO)
    saldo = calcular_saldo_exigible(cronograma, (), date(2026, 1, 9), TASA_PUNITORIO)
    res = aplicar_pago(
        saldo,
        EntradaPago(payoff.total, date(2026, 1, 9), modo=ModoPago.CANCELACION_ANTICIPADA),
    )
    assert res.total_imputado == payoff.total
    assert res.excedente == Decimal("0.00")


def test_caso_7_correccion_1_clic():
    saldo = _saldo(date(2026, 1, 10))
    original = aplicar_pago(saldo, EntradaPago(Decimal("2200.00"), date(2026, 1, 10)))
    reemplazo = aplicar_pago(saldo, EntradaPago(Decimal("500.00"), date(2026, 1, 10)))
    correccion = corregir_pago(original, reemplazo)
    suma_orig = sum(i.monto for i in original.imputaciones)
    suma_rev = sum(i.monto for i in correccion.reversas)
    assert suma_orig + suma_rev == Decimal("0.00")
    assert correccion.reemplazo is reemplazo


def test_caso_8_tolerancia_de_cobro():
    dentro = aplicar_tolerancia(Decimal("2200.00"), Decimal("2199.50"), Decimal("1.00"))
    assert dentro.cuota_cerrada is True
    fuera = aplicar_tolerancia(Decimal("2200.00"), Decimal("2100.00"), Decimal("1.00"))
    assert fuera.cuota_cerrada is False
