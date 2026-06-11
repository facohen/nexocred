import nexocred_core as core


def test_superficie_publica_exportada():
    nombres = {
        "dinero",
        "redondear",
        "calcular_cronograma",
        "calcular_saldo_exigible",
        "aplicar_pago",
        "calcular_payoff",
        "aplicar_tolerancia",
        "corregir_pago",
        "TerminosPrestamo",
        "EntradaPago",
        "ModoPago",
        "ConceptoImputacion",
        "ErrorDominio",
    }
    faltantes = nombres - set(dir(core))
    assert not faltantes, f"faltan exports: {faltantes}"
