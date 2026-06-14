"""Generacion de cronograma por interes directo. Puro y deterministico."""

from datetime import date, timedelta
from decimal import ROUND_FLOOR, Decimal

from nexocred_core.errores import ErrorDominio, ImporteNegativoError
from nexocred_core.modelos import (
    Cronograma,
    FilaCronograma,
    Periodicidad,
    TerminosPrestamo,
)
from nexocred_core.money import CENTAVO, CERO, redondear, sumar

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
    """Reparte 'total' en 'partes' montos de 2 decimales, todos >= 0 y sumando exacto.

    Usa largest-remainder: trunca hacia abajo y reparte el residuo de a centavos
    sobre las primeras cuotas. Asi ninguna fila sale negativa (vs. cargar el residuo
    al ultimo, que con redondeo hacia arriba daba un ultimo monto negativo) y se
    conserva la suma exacta (invariante sagrada de conservacion de plata).
    """
    total_centavos = int((total / CENTAVO).to_integral_value(rounding=ROUND_FLOOR))
    base = total_centavos // partes
    residuo = total_centavos - base * partes  # 0 <= residuo < partes
    montos: list[Decimal] = []
    for i in range(partes):
        centavos = base + (1 if i < residuo else 0)
        montos.append(redondear(Decimal(centavos) * CENTAVO))
    return montos


def calcular_cronograma(terminos: TerminosPrestamo) -> Cronograma:
    if terminos.cantidad_cuotas <= 0:
        raise ErrorDominio("cantidad_cuotas debe ser mayor a cero")
    if terminos.capital <= CERO:
        raise ErrorDominio("capital debe ser mayor a cero")
    if terminos.tasa_interes_directo < Decimal("0"):
        raise ImporteNegativoError("tasa_interes_directo no puede ser negativa")
    if terminos.tasa_punitorio_diario < Decimal("0"):
        raise ImporteNegativoError("tasa_punitorio_diario no puede ser negativa")

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
