"""Metricas de riesgo puras (sin DB, sin float).

Cada funcion opera sobre snapshots de prestamo/cuota que el service layer arma desde
las queries. Todo es Decimal exacto: las ratios se calculan dividiendo Decimales.

Modelo de entrada (PrestamoRiesgo):
- prestamo_id, capital_pendiente (saldo de capital outstanding), dias_atraso (dias del
  tramo vencido mas antiguo impago; 0 si al dia), fecha_originacion, claves de
  concentracion (cliente_id, zona, vendedor_id, producto_id), refinanciado (bool).
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from nexocred_core import CERO, sumar

ESCALA_RATIO = Decimal("0.0001")


@dataclass(frozen=True)
class PrestamoRiesgo:
    prestamo_id: str
    capital_pendiente: Decimal
    dias_atraso: int
    fecha_originacion: date | None = None
    cliente_id: str | None = None
    zona: str | None = None
    vendedor_id: str | None = None
    producto_id: str | None = None
    refinanciado: bool = False
    claves: dict = field(default_factory=dict)


def _total_outstanding(prestamos: list[PrestamoRiesgo]) -> Decimal:
    montos = [p.capital_pendiente for p in prestamos]
    return sumar(*montos) if montos else CERO


def _ratio(numerador: Decimal, denominador: Decimal) -> Decimal:
    if denominador == CERO:
        return CERO
    return (numerador / denominador).quantize(ESCALA_RATIO)


def par(prestamos: list[PrestamoRiesgo], dias: int) -> Decimal:
    """Portfolio at Risk: capital con atraso > `dias` / capital total outstanding."""
    total = _total_outstanding(prestamos)
    en_riesgo = [p.capital_pendiente for p in prestamos if p.dias_atraso >= dias]
    riesgo = sumar(*en_riesgo) if en_riesgo else CERO
    return _ratio(riesgo, total)


_BUCKETS = [
    ("al_dia", 0, 0),
    ("1_30", 1, 30),
    ("31_60", 31, 60),
    ("61_90", 61, 90),
    ("90_mas", 91, None),
]


def aging(prestamos: list[PrestamoRiesgo]) -> dict[str, Decimal]:
    """Reparte el capital outstanding en buckets por dias de atraso."""
    out: dict[str, Decimal] = {nombre: CERO for nombre, _, _ in _BUCKETS}
    for p in prestamos:
        for nombre, lo, hi in _BUCKETS:
            if p.dias_atraso >= lo and (hi is None or p.dias_atraso <= hi):
                out[nombre] = sumar(out[nombre], p.capital_pendiente)
                break
    return out


def concentracion(
    prestamos: list[PrestamoRiesgo], clave: str
) -> dict[str, Decimal]:
    """Participacion (share) del capital outstanding por valor de `clave`
    (cliente_id/zona/vendedor_id/producto_id)."""
    total = _total_outstanding(prestamos)
    acum: dict[str, Decimal] = {}
    for p in prestamos:
        valor = getattr(p, clave, None) or p.claves.get(clave)
        k = str(valor) if valor is not None else "desconocido"
        acum[k] = sumar(acum.get(k, CERO), p.capital_pendiente)
    return {k: _ratio(v, total) for k, v in acum.items()}


def cosechas(prestamos: list[PrestamoRiesgo]) -> dict[str, dict[str, Decimal]]:
    """Agrupa por mes de originacion (YYYY-MM) con capital total y capital en mora
    (atraso > 30), mas la ratio de mora acumulada de la cosecha."""
    grupos: dict[str, list[PrestamoRiesgo]] = {}
    for p in prestamos:
        if p.fecha_originacion is None:
            continue
        mes = f"{p.fecha_originacion.year:04d}-{p.fecha_originacion.month:02d}"
        grupos.setdefault(mes, []).append(p)
    salida: dict[str, dict[str, Decimal]] = {}
    for mes, ps in sorted(grupos.items()):
        total = _total_outstanding(ps)
        mora = [p.capital_pendiente for p in ps if p.dias_atraso > 30]
        mora_total = sumar(*mora) if mora else CERO
        salida[mes] = {
            "capital": total,
            "mora": mora_total,
            "ratio_mora": _ratio(mora_total, total),
        }
    return salida


def porcentaje_refinanciado(prestamos: list[PrestamoRiesgo]) -> Decimal:
    total = _total_outstanding(prestamos)
    refi = [p.capital_pendiente for p in prestamos if p.refinanciado]
    refi_total = sumar(*refi) if refi else CERO
    return _ratio(refi_total, total)


# Ponderaciones de perdida esperada por bucket de atraso (heuristica POC, spec §M07).
_PE_PONDERACION = {
    "al_dia": Decimal("0.01"),
    "1_30": Decimal("0.05"),
    "31_60": Decimal("0.20"),
    "61_90": Decimal("0.50"),
    "90_mas": Decimal("1.00"),
}


def perdida_esperada(prestamos: list[PrestamoRiesgo]) -> Decimal:
    """Suma ponderada del capital outstanding por bucket de atraso."""
    buckets = aging(prestamos)
    terminos = [
        (buckets[b] * w).quantize(Decimal("0.01"))
        for b, w in _PE_PONDERACION.items()
    ]
    return sumar(*terminos) if terminos else CERO
