from datetime import date
from decimal import Decimal

from app.m07_riesgo.metricas import (
    PrestamoRiesgo,
    aging,
    concentracion,
    cosechas,
    par,
    perdida_esperada,
    porcentaje_refinanciado,
)


def _p(pid, capital, dias, **kw):
    return PrestamoRiesgo(
        prestamo_id=pid, capital_pendiente=Decimal(capital), dias_atraso=dias, **kw
    )


def _cartera():
    # 100.000 total; 10.000 con atraso > 30
    return [
        _p("a", "60000", 0, zona="norte", producto_id="P1"),
        _p("b", "30000", 15, zona="sur", producto_id="P1"),
        _p("c", "10000", 45, zona="norte", producto_id="P2", refinanciado=True),
    ]


def test_par30_exacto():
    assert par(_cartera(), 30) == Decimal("0.1000")


def test_par60_y_90_cero():
    assert par(_cartera(), 60) == Decimal("0.0000")
    assert par(_cartera(), 90) == Decimal("0.0000")


def test_par_denominador_cero():
    assert par([], 30) == Decimal("0.0000")


def test_aging_buckets():
    a = aging(_cartera())
    assert a["al_dia"] == Decimal("60000")
    assert a["1_30"] == Decimal("30000")
    assert a["31_60"] == Decimal("10000")
    assert a["61_90"] == Decimal("0")
    assert a["90_mas"] == Decimal("0")


def test_concentracion_por_zona():
    c = concentracion(_cartera(), "zona")
    assert c["norte"] == Decimal("0.7000")  # 70.000 / 100.000
    assert c["sur"] == Decimal("0.3000")


def test_concentracion_por_producto():
    c = concentracion(_cartera(), "producto_id")
    assert c["P1"] == Decimal("0.9000")
    assert c["P2"] == Decimal("0.1000")


def test_cosechas_por_mes():
    cartera = [
        _p("a", "50000", 0, fecha_originacion=date(2026, 1, 5)),
        _p("b", "50000", 45, fecha_originacion=date(2026, 1, 20)),
        _p("c", "20000", 0, fecha_originacion=date(2026, 2, 3)),
    ]
    cos = cosechas(cartera)
    assert cos["2026-01"]["capital"] == Decimal("100000")
    assert cos["2026-01"]["mora"] == Decimal("50000")
    assert cos["2026-01"]["ratio_mora"] == Decimal("0.5000")
    assert cos["2026-02"]["ratio_mora"] == Decimal("0.0000")


def test_porcentaje_refinanciado():
    assert porcentaje_refinanciado(_cartera()) == Decimal("0.1000")


def test_perdida_esperada_ponderada():
    # 60000*0.01 + 30000*0.05 + 10000*0.20 = 600 + 1500 + 2000 = 4100
    assert perdida_esperada(_cartera()) == Decimal("4100.00")
