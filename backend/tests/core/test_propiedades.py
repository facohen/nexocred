"""Propiedades (Hypothesis): conservacion, determinismo, no-negatividad."""

from datetime import date
from decimal import Decimal

from hypothesis import given, settings
from hypothesis import strategies as st

from nexocred_core import (
    EntradaPago,
    EstadoCuotaExigible,
    Periodicidad,
    SaldoExigible,
    TerminosPrestamo,
    aplicar_pago,
    calcular_cronograma,
    calcular_saldo_exigible,
)

# Estrategia de dinero: enteros de centavos -> Decimal de 2 decimales, sin float.
montos = st.integers(min_value=0, max_value=10_000_00).map(
    lambda c: (Decimal(c) / Decimal(100)).quantize(Decimal("0.01"))
)
montos_positivos = st.integers(min_value=1, max_value=10_000_00).map(
    lambda c: (Decimal(c) / Decimal(100)).quantize(Decimal("0.01"))
)


def _saldo(punitorio, interes, capital):
    return SaldoExigible(
        fecha_negocio=date(2026, 1, 20),
        cuotas=(EstadoCuotaExigible(1, date(2026, 1, 10), punitorio, interes, capital),),
        capital_no_vencido=Decimal("0.00"),
        interes_no_vencido=Decimal("0.00"),
    )


@settings(max_examples=200)
@given(p=montos, i=montos, c=montos, pago=montos)
def test_conservacion_de_dinero(p, i, c, pago):
    res = aplicar_pago(_saldo(p, i, c), EntradaPago(pago, date(2026, 1, 20)))
    assert res.total_imputado + res.excedente == pago


@settings(max_examples=200)
@given(p=montos, i=montos, c=montos, pago=montos)
def test_imputaciones_nunca_negativas(p, i, c, pago):
    res = aplicar_pago(_saldo(p, i, c), EntradaPago(pago, date(2026, 1, 20)))
    assert all(imp.monto >= Decimal("0.00") for imp in res.imputaciones)
    assert res.excedente >= Decimal("0.00")


@settings(max_examples=200)
@given(p=montos, i=montos, c=montos, pago=montos)
def test_no_imputa_mas_que_lo_disponible_por_concepto(p, i, c, pago):
    res = aplicar_pago(_saldo(p, i, c), EntradaPago(pago, date(2026, 1, 20)))
    por_concepto = {}
    for imp in res.imputaciones:
        por_concepto[imp.concepto] = por_concepto.get(imp.concepto, Decimal("0")) + imp.monto
    from nexocred_core import ConceptoImputacion as K

    assert por_concepto.get(K.PUNITORIO_VENCIDO, Decimal("0")) <= p
    assert por_concepto.get(K.INTERES_VENCIDO, Decimal("0")) <= i
    assert por_concepto.get(K.CAPITAL_VENCIDO, Decimal("0")) <= c


@settings(max_examples=100)
@given(
    capital=montos_positivos,
    cuotas=st.integers(min_value=1, max_value=24),
)
def test_cronograma_es_deterministico_y_reconcilia(capital, cuotas):
    terminos = TerminosPrestamo(
        capital=capital,
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=cuotas,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
    )
    a = calcular_cronograma(terminos)
    b = calcular_cronograma(terminos)
    assert a == b  # determinismo
    assert a.total_capital == capital  # reconciliacion exacta


@settings(max_examples=300)
@given(
    total_centavos=st.integers(min_value=0, max_value=10_000_00),
    partes=st.integers(min_value=1, max_value=60),
)
def test_reparto_parejo_no_negativo_y_conserva(total_centavos, partes):
    """BUG 3: el reparto nunca produce una fila negativa y conserva el total exacto."""
    from nexocred_core.cronograma import _reparto_parejo

    total = (Decimal(total_centavos) / Decimal(100)).quantize(Decimal("0.01"))
    montos = _reparto_parejo(total, partes)
    assert len(montos) == partes
    assert all(m >= Decimal("0.00") for m in montos)  # ninguna cuota negativa
    assert sum(montos) == total  # conservacion de plata exacta


@settings(max_examples=100)
@given(capital=montos_positivos)
def test_saldo_exigible_no_negativo(capital):
    terminos = TerminosPrestamo(
        capital=capital,
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=3,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
        tasa_punitorio_diario=Decimal("0.001"),
    )
    saldo = calcular_saldo_exigible(
        calcular_cronograma(terminos), (), date(2026, 6, 10), Decimal("0.001")
    )
    for cuota in saldo.cuotas:
        assert cuota.punitorio >= Decimal("0.00")
        assert cuota.interes >= Decimal("0.00")
        assert cuota.capital >= Decimal("0.00")
    assert saldo.total_exigible >= Decimal("0.00")
