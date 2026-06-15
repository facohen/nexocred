"""Tests puros de las metricas de rentabilidad (sin DB, sin float)."""

from decimal import Decimal

from app.m14_analytics.metricas import (
    PrestamoRentabilidad,
    agregar_por,
    costo_fondeo,
    margen_bruto,
    margen_neto,
    pe_monetaria,
    rentabilidad_pct,
)

TASA = Decimal("0.40")  # costo de capital anual


def _p(**kw) -> PrestamoRentabilidad:
    base = dict(
        prestamo_id="p1",
        producto_id="prod-a",
        vendedor_id="v1",
        cliente_id="c1",
        cosecha="2026-01",
        zona="centro",
        capital_desembolsado=Decimal("100000"),
        interes_cobrado=Decimal("20000"),
        comision_originacion=Decimal("2000"),
        gastos_originacion=Decimal("1000"),
        capital_pendiente=Decimal("100000"),
        dias_atraso=0,
        dias_vida=365,
        refinanciado=False,
    )
    base.update(kw)
    return PrestamoRentabilidad(**base)  # type: ignore[arg-type]


def test_margen_bruto():
    # 20000 - 2000 - 1000 = 17000
    assert margen_bruto(_p()) == Decimal("17000.00")


def test_costo_fondeo_anio_completo():
    # 100000 * 0.40 * 365/365 = 40000
    assert costo_fondeo(_p(dias_vida=365), TASA) == Decimal("40000.00")


def test_costo_fondeo_medio_anio():
    # 100000 * 0.40 * 182/365 = 19945.21
    assert costo_fondeo(_p(dias_vida=182), TASA) == Decimal("19945.21")


def test_costo_fondeo_capital_cero():
    assert costo_fondeo(_p(capital_pendiente=Decimal("0")), TASA) == Decimal("0")


def test_pe_monetaria_al_dia():
    # bucket al_dia = 1% de 100000 = 1000
    assert pe_monetaria(_p(dias_atraso=0)) == Decimal("1000.00")


def test_pe_monetaria_mora_grave():
    # bucket 90_mas = 100% de 100000 = 100000
    assert pe_monetaria(_p(dias_atraso=120)) == Decimal("100000.00")


def test_margen_neto_y_pct():
    # mb 17000 - fondeo 40000 - pe 1000 = -24000 (destruye valor con vida=365)
    p = _p(dias_vida=365, dias_atraso=0)
    assert margen_neto(p, TASA) == Decimal("-24000.00")
    # -24000 / 100000 = -0.2400
    assert rentabilidad_pct(p, TASA) == Decimal("-0.2400")


def test_margen_neto_positivo_vida_corta():
    # vida 30 dias: fondeo = 100000*0.40*30/365 = 3287.67
    # mn = 17000 - 3287.67 - 1000 = 12712.33
    p = _p(dias_vida=30)
    assert margen_neto(p, TASA) == Decimal("12712.33")


def test_rentabilidad_pct_capital_cero():
    assert rentabilidad_pct(_p(capital_desembolsado=Decimal("0")), TASA) == Decimal("0")


def test_agregar_por_producto_suma_totales():
    prestamos = [
        _p(prestamo_id="p1", producto_id="prod-a", dias_vida=30),
        _p(prestamo_id="p2", producto_id="prod-a", dias_vida=30),
        _p(prestamo_id="p3", producto_id="prod-b", dias_vida=365),
    ]
    agg = agregar_por(prestamos, "producto", TASA)
    por_clave = {a.clave: a for a in agg}
    assert por_clave["prod-a"].n_prestamos == 2
    assert por_clave["prod-a"].capital == Decimal("200000.00")
    # prod-a (vida corta) rinde positivo; prod-b (vida larga) destruye valor
    assert por_clave["prod-a"].margen_neto > 0
    assert por_clave["prod-b"].margen_neto < 0
    # orden: mas rentable primero
    assert agg[0].clave == "prod-a"


def test_agregar_por_clave_desconocida_agrupa():
    prestamos = [_p(producto_id=None)]
    agg = agregar_por(prestamos, "producto", TASA)
    assert agg[0].clave == "desconocido"
