"""Metricas de rentabilidad puras (sin DB, sin float).

Operan sobre snapshots `PrestamoRentabilidad` que el service arma desde el motor
existente (cronogramas/imputaciones, comisiones, gastos de originacion, riesgo).
Todo es Decimal exacto.

Definiciones:
- margen_bruto = interes cobrado - comision originacion - gastos originacion
- costo_fondeo = capital colocado * tasa anual * (dias_vida / 365)
- pe_monetaria = capital_pendiente ponderado por bucket de atraso (reusa la
  ponderacion de m07_riesgo)
- margen_neto = margen_bruto - costo_fondeo - pe_monetaria
- rentabilidad_pct = margen_neto / capital_desembolsado
"""

from dataclasses import dataclass
from decimal import Decimal

from app.finanzas import prorratear_costo
from app.m07_riesgo.metricas import _PE_PONDERACION, bucket_atraso
from nexocred_core import CERO, redondear, sumar

ESCALA_RATIO = Decimal("0.0001")


@dataclass(frozen=True)
class PrestamoRentabilidad:
    prestamo_id: str
    producto_id: str | None
    vendedor_id: str | None
    cliente_id: str | None
    cosecha: str | None  # YYYY-MM de la fecha de desembolso
    zona: str | None
    sector: str | None
    capital_desembolsado: Decimal
    interes_cobrado: Decimal
    comision_originacion: Decimal
    gastos_originacion: Decimal
    capital_pendiente: Decimal
    dias_atraso: int
    dias_vida: int  # dias desde el desembolso hasta la fecha de corte
    refinanciado: bool = False


def margen_bruto(p: PrestamoRentabilidad) -> Decimal:
    return redondear(p.interes_cobrado - p.comision_originacion - p.gastos_originacion)


def costo_fondeo(p: PrestamoRentabilidad, tasa_anual: Decimal) -> Decimal:
    """Costo de fondear el capital pendiente durante la vida transcurrida."""
    return prorratear_costo(p.capital_pendiente, tasa_anual, p.dias_vida)


def pe_monetaria(p: PrestamoRentabilidad) -> Decimal:
    """Perdida esperada en dinero = capital pendiente * ponderacion del bucket
    (reusa los tramos de aging de m07 vía bucket_atraso)."""
    ponderacion = _PE_PONDERACION[bucket_atraso(p.dias_atraso)]
    return redondear(p.capital_pendiente * ponderacion)


def margen_neto(p: PrestamoRentabilidad, tasa_anual: Decimal) -> Decimal:
    return redondear(margen_bruto(p) - costo_fondeo(p, tasa_anual) - pe_monetaria(p))


def rentabilidad_pct(p: PrestamoRentabilidad, tasa_anual: Decimal) -> Decimal:
    if p.capital_desembolsado == CERO:
        return CERO
    return (margen_neto(p, tasa_anual) / p.capital_desembolsado).quantize(ESCALA_RATIO)


_CLAVES = {
    "producto": "producto_id",
    "vendedor": "vendedor_id",
    "segmento": "cliente_id",
    "cosecha": "cosecha",
    "zona": "zona",
}


@dataclass(frozen=True)
class AgregadoRentabilidad:
    clave: str
    n_prestamos: int
    capital: Decimal
    interes_cobrado: Decimal
    comision: Decimal
    gastos: Decimal
    costo_fondeo: Decimal
    pe_monetaria: Decimal
    margen_bruto: Decimal
    margen_neto: Decimal
    rentabilidad_pct: Decimal


def agregar_por(
    prestamos: list[PrestamoRentabilidad], dimension: str, tasa_anual: Decimal
) -> list[AgregadoRentabilidad]:
    """Agrega rentabilidad por la dimension pedida (producto/vendedor/segmento/
    cosecha/zona). La rentabilidad del grupo se computa sobre los totales (margen
    neto del grupo / capital del grupo), no como promedio de ratios."""
    if dimension not in _CLAVES:
        raise ValueError(f"dimension desconocida: {dimension}")
    attr = _CLAVES[dimension]
    grupos: dict[str, list[PrestamoRentabilidad]] = {}
    for p in prestamos:
        clave = getattr(p, attr) or "desconocido"
        grupos.setdefault(clave, []).append(p)

    salida: list[AgregadoRentabilidad] = []
    for clave, ps in grupos.items():
        capital = sumar(*(p.capital_desembolsado for p in ps))
        interes = sumar(*(p.interes_cobrado for p in ps))
        comision = sumar(*(p.comision_originacion for p in ps))
        gastos = sumar(*(p.gastos_originacion for p in ps))
        fondeo = sumar(*(costo_fondeo(p, tasa_anual) for p in ps))
        pe = sumar(*(pe_monetaria(p) for p in ps))
        mb = redondear(interes - comision - gastos)
        mn = redondear(mb - fondeo - pe)
        rent = (mn / capital).quantize(ESCALA_RATIO) if capital != CERO else CERO
        salida.append(
            AgregadoRentabilidad(
                clave=clave,
                n_prestamos=len(ps),
                capital=redondear(capital),
                interes_cobrado=redondear(interes),
                comision=redondear(comision),
                gastos=redondear(gastos),
                costo_fondeo=redondear(fondeo),
                pe_monetaria=redondear(pe),
                margen_bruto=mb,
                margen_neto=mn,
                rentabilidad_pct=rent,
            )
        )
    # ordenado por margen neto descendente: lo mas rentable primero.
    salida.sort(key=lambda a: a.margen_neto, reverse=True)
    return salida
