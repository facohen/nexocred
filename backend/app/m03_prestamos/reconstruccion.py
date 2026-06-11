"""Reconstruccion de value objects del core a partir de filas persistidas.

El snapshot inmutable del prestamo (`prestamo.snapshot_terminos` JSONB) y las filas
`imputacion` previas reconstruyen exactamente los objetos que el core necesita. El
backend nunca re-deriva interes/punitorio: siempre reconstruye y delega al core.
"""

from datetime import date
from decimal import Decimal

from nexocred_core import (
    ConceptoImputacion,
    Cronograma,
    FilaCronograma,
    Imputacion,
    Periodicidad,
    TerminosPrestamo,
    calcular_cronograma,
)


def terminos_desde_snapshot(snapshot: dict) -> TerminosPrestamo:
    return TerminosPrestamo(
        capital=Decimal(str(snapshot["capital"])),
        tasa_interes_directo=Decimal(str(snapshot["tasa_interes_directo"])),
        cantidad_cuotas=int(snapshot["cantidad_cuotas"]),
        periodicidad=Periodicidad(snapshot["periodicidad"]),
        fecha_primera_cuota=date.fromisoformat(snapshot["fecha_primera_cuota"]),
        tasa_punitorio_diario=Decimal(str(snapshot["tasa_punitorio_diario"])),
    )


def snapshot_desde_terminos(terminos: TerminosPrestamo) -> dict:
    return {
        "capital": str(terminos.capital),
        "tasa_interes_directo": str(terminos.tasa_interes_directo),
        "cantidad_cuotas": terminos.cantidad_cuotas,
        "periodicidad": terminos.periodicidad.value,
        "fecha_primera_cuota": terminos.fecha_primera_cuota.isoformat(),
        "tasa_punitorio_diario": str(terminos.tasa_punitorio_diario),
    }


def cronograma_desde_snapshot(snapshot: dict) -> Cronograma:
    """Cronograma deterministico desde el snapshot inmutable (re-cálculo puro del core)."""
    return calcular_cronograma(terminos_desde_snapshot(snapshot))


def cronograma_desde_cuotas(filas: list) -> Cronograma:
    """Cronograma materializado desde las filas `cuota` persistidas."""
    ordenadas = sorted(filas, key=lambda f: f.numero)
    return Cronograma(
        filas=tuple(
            FilaCronograma(
                numero=f.numero,
                vencimiento=f.vencimiento,
                capital=f.capital,
                interes=f.interes,
                cuota=f.cuota if f.cuota is not None else f.capital + f.interes,
            )
            for f in ordenadas
        )
    )


def imputaciones_core(filas: list) -> tuple[Imputacion, ...]:
    """filas: ORM Imputacion (concepto str, monto Decimal, orden_waterfall int,
    cuota_numero int|None). Las imputaciones EXCEDENTE no afectan el saldo exigible."""
    return tuple(
        Imputacion(
            concepto=ConceptoImputacion(f.concepto),
            monto=f.monto,
            orden_waterfall=f.orden_waterfall or 0,
            cuota_numero=f.cuota_numero,
        )
        for f in filas
        if f.concepto is not None
    )
