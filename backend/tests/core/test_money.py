from decimal import Decimal

import pytest

from nexocred_core.errores import ImporteNegativoError
from nexocred_core.money import CENTAVO, CERO, ErrorDinero, dinero, redondear, restar, sumar


def test_dinero_acepta_decimal_int_str():
    assert dinero(Decimal("10.005")) == Decimal("10.01")  # ROUND_HALF_UP
    assert dinero(10) == Decimal("10.00")
    assert dinero("14500.5") == Decimal("14500.50")


def test_dinero_redondea_half_up():
    assert dinero("0.005") == Decimal("0.01")
    assert dinero("2.675") == Decimal("2.68")


def test_dinero_rechaza_float():
    with pytest.raises(ErrorDinero):
        dinero(10.5)


def test_dinero_rechaza_none_y_texto_invalido():
    with pytest.raises(ErrorDinero):
        dinero("no-es-numero")
    with pytest.raises(ErrorDinero):
        dinero(None)  # type: ignore[arg-type]


def test_redondear_es_idempotente():
    assert redondear(dinero("3.14")) == Decimal("3.14")


def test_sumar_y_restar_quedan_quantizados():
    assert sumar(dinero("0.10"), dinero("0.20")) == Decimal("0.30")
    assert restar(dinero("1.00"), dinero("0.99")) == Decimal("0.01")


def test_constantes():
    assert CERO == Decimal("0.00")  # noqa: SIM300
    assert CENTAVO == Decimal("0.01")  # noqa: SIM300


def test_dinero_negativo_permitido_por_defecto_pero_validable():
    # dinero() en si permite negativos (reversas); la validacion es opt-in
    assert dinero("-5.00") == Decimal("-5.00")
    with pytest.raises(ImporteNegativoError):
        dinero("-5.00", permitir_negativo=False)
