"""Primitivas monetarias del core. Solo Decimal. Prohibido float."""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from nexocred_core.errores import ErrorDominio, ImporteNegativoError

CERO = Decimal("0.00")
CENTAVO = Decimal("0.01")
_DOS_DECIMALES = Decimal("0.01")


class ErrorDinero(ErrorDominio):
    """Importe invalido: float, texto no numerico o nulo."""


def dinero(valor: Decimal | int | str, *, permitir_negativo: bool = True) -> Decimal:
    """Normaliza un importe a Decimal con 2 decimales (ROUND_HALF_UP).

    Acepta Decimal, int o str. Rechaza float explicitamente (spec 5.2).
    """
    if isinstance(valor, float):
        raise ErrorDinero("No se permite float en importes; usar Decimal, int o str")
    if isinstance(valor, bool) or valor is None:
        raise ErrorDinero(f"Importe invalido: {valor!r}")
    try:
        d = Decimal(valor)
    except (InvalidOperation, TypeError) as exc:
        raise ErrorDinero(f"Importe invalido: {valor!r}") from exc
    if not d.is_finite():
        raise ErrorDinero(f"Importe no finito: {valor!r}")
    cuantizado = d.quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP)
    if not permitir_negativo and cuantizado < CERO:
        raise ImporteNegativoError(f"Importe negativo no permitido: {cuantizado}")
    return cuantizado


def redondear(valor: Decimal) -> Decimal:
    """Redondea un Decimal ya tipado a 2 decimales ROUND_HALF_UP."""
    return valor.quantize(_DOS_DECIMALES, rounding=ROUND_HALF_UP)


def sumar(*valores: Decimal) -> Decimal:
    total = CERO
    for v in valores:
        total += v
    return redondear(total)


def restar(a: Decimal, b: Decimal) -> Decimal:
    return redondear(a - b)
