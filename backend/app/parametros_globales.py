"""Parámetros globales del sistema (almacén simple en memoria para F1a).

Vive en un módulo neutral sin dependencias de routers/auth para que servicios de
cualquier capa (tesorería, analytics) puedan leerlo sin invertir la jerarquía de
dependencias (un servicio NO debe importar de un router).

`costo_capital_anual`: tasa de fondeo anual (tanto por uno, ej "0.40" = 40%). Es
el costo de oportunidad del capital colocado; lo usan tesorería (egresos de
cashflow, tasa de descuento DCF) y analytics (margen neto). Configurable vía
PATCH /parametros (admin). Refinable a futuro a costo por fuente de fondeo.

Limitación conocida (deuda): el store es un dict en memoria por proceso. Con
múltiples workers un PATCH no se propaga entre ellos; persistirlo en DB queda
como trabajo futuro.
"""

from decimal import Decimal

PARAMETROS_GLOBALES: dict[str, object] = {
    "bcra_vigencia_dias": 30,
    "tolerancia_cobro": "50.00",
    "costo_capital_anual": "0.40",
}

_COSTO_CAPITAL_DEFAULT = Decimal("0.40")


def costo_capital_anual() -> Decimal:
    """Costo de capital anual (Decimal) del store global. Si el valor guardado no
    es un Decimal válido, cae al default en vez de romper aguas abajo."""
    valor = PARAMETROS_GLOBALES.get("costo_capital_anual", _COSTO_CAPITAL_DEFAULT)
    try:
        return Decimal(str(valor))
    except (ArithmeticError, ValueError):
        return _COSTO_CAPITAL_DEFAULT
