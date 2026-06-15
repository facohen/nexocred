"""Helpers financieros puros compartidos entre módulos (Decimal, sin float)."""

from decimal import Decimal

from nexocred_core import CERO, redondear

_DIAS_ANIO = Decimal("365")


def prorratear_costo(capital: Decimal, tasa_anual: Decimal, dias: int) -> Decimal:
    """Costo de fondear `capital` a `tasa_anual` durante `dias` (base act/365).

    Lo usan tesorería (sobre el capital colocado agregado, por tramo) y analytics
    (sobre el capital pendiente individual, por vida del préstamo). Devuelve CERO
    si el capital no es positivo o los días no son positivos.
    """
    if capital <= CERO or dias <= 0:
        return CERO
    return redondear(capital * tasa_anual * Decimal(dias) / _DIAS_ANIO)
