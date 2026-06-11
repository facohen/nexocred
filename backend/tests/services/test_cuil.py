from app.m01_personas.cuil import calcular_digito_verificador, validar_cuil


def test_cuil_valido():
    # dv calculado por modulo 11 para 2012345678 es 6
    assert validar_cuil("20123456786") is True


def test_cuil_valido_27():
    assert validar_cuil("27111111117") is True


def test_cuil_digito_verificador_incorrecto():
    assert validar_cuil("20123456780") is False


def test_cuil_longitud_invalida():
    assert validar_cuil("123") is False
    assert validar_cuil("201234567860") is False


def test_cuil_no_numerico():
    assert validar_cuil("20-12345678-6") is False
    assert validar_cuil("2012345678X") is False


def test_digito_verificador_consistente():
    assert calcular_digito_verificador("2012345678") == 6
    assert calcular_digito_verificador("2711111111") == 7
