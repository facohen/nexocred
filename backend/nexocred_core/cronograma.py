"""Generacion de cronograma por interes directo. Puro y deterministico."""

from datetime import date, timedelta
from decimal import Decimal

from nexocred_core.errores import ErrorDominio
from nexocred_core.modelos import (
    Cronograma,
    FilaCronograma,
    Periodicidad,
    TerminosPrestamo,
)
from nexocred_core.money import CERO, redondear, restar, sumar

_DIAS_POR_PERIODICIDAD = {
    Periodicidad.SEMANAL: 7,
    Periodicidad.QUINCENAL: 15,
}


def _avanzar(desde: date, periodicidad: Periodicidad, pasos: int) -> date:
    if periodicidad in _DIAS_POR_PERIODICIDAD:
        return desde + timedelta(days=_DIAS_POR_PERIODICIDAD[periodicidad] * pasos)
    # mensual: mismo dia del mes, avanzando 'pasos' meses
    mes_index = (desde.month - 1) + pasos
    anio = desde.year + mes_index // 12
    mes = mes_index % 12 + 1
    return date(anio, mes, desde.day)


def _reparto_parejo(total: Decimal, partes: int) -> list[Decimal]:
    """Reparte 'total' en 'partes' montos de 2 decimales; el ultimo absorbe el residuo."""
    base = redondear(total / Decimal(partes))
    montos = [base] * (partes - 1)
    ultimo = restar(total, sumar(*montos)) if montos else total
    montos.append(ultimo)
    return montos


def calcular_cronograma(terminos: TerminosPrestamo) -> Cronograma:
    if terminos.cantidad_cuotas <= 0:
        raise ErrorDominio("cantidad_cuotas debe ser mayor a cero")
    if terminos.capital <= CERO:
        raise ErrorDominio("capital debe ser mayor a cero")

    interes_total = redondear(terminos.capital * terminos.tasa_interes_directo)
    capitales = _reparto_parejo(terminos.capital, terminos.cantidad_cuotas)
    intereses = _reparto_parejo(interes_total, terminos.cantidad_cuotas)

    filas: list[FilaCronograma] = []
    for i in range(terminos.cantidad_cuotas):
        vencimiento = _avanzar(terminos.fecha_primera_cuota, terminos.periodicidad, i)
        cuota = sumar(capitales[i], intereses[i])
        filas.append(
            FilaCronograma(
                numero=i + 1,
                vencimiento=vencimiento,
                capital=capitales[i],
                interes=intereses[i],
                cuota=cuota,
            )
        )
    return Cronograma(filas=tuple(filas))
