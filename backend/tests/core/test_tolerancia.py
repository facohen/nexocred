from decimal import Decimal

import pytest

from nexocred_core.errores import ImporteNegativoError
from nexocred_core.tolerancia import aplicar_tolerancia


def test_dentro_de_tolerancia_cierra_cuota():
    res = aplicar_tolerancia(
        cuota_exigible=Decimal("2200.00"),
        monto_pagado=Decimal("2199.50"),
        tolerancia=Decimal("1.00"),
    )
    assert res.dentro_de_tolerancia is True
    assert res.diferencia == Decimal("0.50")
    assert res.ajuste == Decimal("0.50")
    assert res.cuota_cerrada is True


def test_fuera_de_tolerancia_mantiene_saldo():
    res = aplicar_tolerancia(
        cuota_exigible=Decimal("2200.00"),
        monto_pagado=Decimal("2100.00"),
        tolerancia=Decimal("1.00"),
    )
    assert res.dentro_de_tolerancia is False
    assert res.diferencia == Decimal("100.00")
    assert res.ajuste == Decimal("0.00")
    assert res.cuota_cerrada is False


def test_pago_exacto_no_genera_ajuste():
    res = aplicar_tolerancia(Decimal("2200.00"), Decimal("2200.00"), Decimal("1.00"))
    assert res.dentro_de_tolerancia is True
    assert res.ajuste == Decimal("0.00")
    assert res.cuota_cerrada is True


def test_sobrepago_no_es_diferencia_a_tolerar():
    res = aplicar_tolerancia(Decimal("2200.00"), Decimal("2300.00"), Decimal("1.00"))
    assert res.diferencia == Decimal("0.00")
    assert res.cuota_cerrada is True
    assert res.ajuste == Decimal("0.00")


def test_rechaza_cuota_exigible_negativa():
    with pytest.raises(ImporteNegativoError):
        aplicar_tolerancia(Decimal("-1.00"), Decimal("0.00"), Decimal("1.00"))


def test_rechaza_monto_pagado_negativo():
    with pytest.raises(ImporteNegativoError):
        aplicar_tolerancia(Decimal("2200.00"), Decimal("-1.00"), Decimal("1.00"))


def test_rechaza_tolerancia_negativa():
    with pytest.raises(ImporteNegativoError):
        aplicar_tolerancia(Decimal("2200.00"), Decimal("2200.00"), Decimal("-1.00"))
