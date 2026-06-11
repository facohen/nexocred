from datetime import date
from decimal import Decimal

import pytest

from nexocred_core.cronograma import calcular_cronograma
from nexocred_core.errores import ErrorDominio, ImporteNegativoError
from nexocred_core.modelos import Periodicidad, TerminosPrestamo


def _terminos(**kw):
    base = dict(
        capital=Decimal("10000.00"),
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=5,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
        tasa_punitorio_diario=Decimal("0.001"),
    )
    base.update(kw)
    return TerminosPrestamo(**base)


def test_cantidad_de_filas_igual_a_cuotas():
    c = calcular_cronograma(_terminos())
    assert len(c.filas) == 5


def test_totales_reconcilian_exactamente():
    c = calcular_cronograma(_terminos())
    assert c.total_capital == Decimal("10000.00")
    assert c.total_interes == Decimal("1000.00")  # 10000 * 0.10
    assert c.total_a_pagar == Decimal("11000.00")


def test_cuota_pareja_cuando_divide_exacto():
    c = calcular_cronograma(_terminos())
    for f in c.filas:
        assert f.capital == Decimal("2000.00")
        assert f.interes == Decimal("200.00")
        assert f.cuota == Decimal("2200.00")


def test_residuo_de_redondeo_va_en_ultima_cuota():
    # 10000 / 3 = 3333.333... -> primeras 3333.33, ultima absorbe
    c = calcular_cronograma(_terminos(cantidad_cuotas=3, tasa_interes_directo=Decimal("0")))
    assert c.filas[0].capital == Decimal("3333.33")
    assert c.filas[1].capital == Decimal("3333.33")
    assert c.filas[2].capital == Decimal("3333.34")
    assert c.total_capital == Decimal("10000.00")


def test_vencimientos_mensuales_consecutivos():
    c = calcular_cronograma(_terminos(cantidad_cuotas=3))
    assert c.filas[0].vencimiento == date(2026, 1, 10)
    assert c.filas[1].vencimiento == date(2026, 2, 10)
    assert c.filas[2].vencimiento == date(2026, 3, 10)


def test_vencimientos_semanales():
    c = calcular_cronograma(_terminos(periodicidad=Periodicidad.SEMANAL, cantidad_cuotas=2))
    assert c.filas[0].vencimiento == date(2026, 1, 10)
    assert c.filas[1].vencimiento == date(2026, 1, 17)


def test_rechaza_cantidad_cuotas_invalida():
    with pytest.raises(ErrorDominio):
        calcular_cronograma(_terminos(cantidad_cuotas=0))


def test_rechaza_capital_no_positivo():
    with pytest.raises(ErrorDominio):
        calcular_cronograma(_terminos(capital=Decimal("0.00")))


def test_rechaza_tasa_interes_negativa():
    with pytest.raises(ImporteNegativoError):
        calcular_cronograma(_terminos(tasa_interes_directo=Decimal("-0.01")))


def test_rechaza_tasa_punitorio_negativa():
    with pytest.raises(ImporteNegativoError):
        calcular_cronograma(_terminos(tasa_punitorio_diario=Decimal("-0.001")))
