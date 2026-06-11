"""Validacion de CUIL/CUIT por digito verificador (modulo 11)."""

_PESOS = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)


def calcular_digito_verificador(cuil10: str) -> int:
    """Calcula el digito verificador de los primeros 10 digitos del CUIL.

    Algoritmo modulo 11: suma ponderada, dv = 11 - (suma % 11),
    con 11 -> 0 y 10 -> 9 (convencion AFIP simplificada para el POC)."""
    suma = sum(int(c) * p for c, p in zip(cuil10, _PESOS, strict=True))
    resto = 11 - (suma % 11)
    if resto == 11:
        return 0
    if resto == 10:
        return 9
    return resto


def validar_cuil(cuil: str) -> bool:
    if not isinstance(cuil, str) or len(cuil) != 11 or not cuil.isdigit():
        return False
    return calcular_digito_verificador(cuil[:10]) == int(cuil[10])
