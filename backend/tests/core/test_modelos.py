import dataclasses
from datetime import date
from decimal import Decimal

import pytest

from nexocred_core.modelos import (
    ConceptoImputacion,
    Cronograma,
    EntradaPago,
    EstadoCuotaExigible,
    FilaCronograma,
    Imputacion,
    ModoPago,
    Periodicidad,
    TerminosPrestamo,
)


def test_terminos_prestamo_es_inmutable():
    t = TerminosPrestamo(
        capital=Decimal("10000.00"),
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=5,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
        tasa_punitorio_diario=Decimal("0.001"),
    )
    with pytest.raises(dataclasses.FrozenInstanceError):
        t.capital = Decimal("1.00")  # type: ignore[misc]


def test_fila_cronograma_campos():
    f = FilaCronograma(
        numero=1,
        vencimiento=date(2026, 1, 10),
        capital=Decimal("2000.00"),
        interes=Decimal("200.00"),
        cuota=Decimal("2200.00"),
    )
    assert f.numero == 1
    assert f.cuota == Decimal("2200.00")


def test_cronograma_agrega_filas_y_totaliza():
    filas = (
        FilaCronograma(
            1, date(2026, 1, 10), Decimal("2000.00"), Decimal("200.00"), Decimal("2200.00")
        ),
        FilaCronograma(
            2, date(2026, 2, 10), Decimal("2000.00"), Decimal("200.00"), Decimal("2200.00")
        ),
    )
    c = Cronograma(filas=filas)
    assert c.total_capital == Decimal("4000.00")
    assert c.total_interes == Decimal("400.00")
    assert c.total_a_pagar == Decimal("4400.00")


def test_enums_existen():
    assert ModoPago.NORMAL.value == "normal"
    assert ModoPago.CANCELACION_ANTICIPADA.value == "cancelacion_anticipada"
    assert ConceptoImputacion.PUNITORIO_VENCIDO.value == "punitorio_vencido"
    assert ConceptoImputacion.EXCEDENTE.value == "excedente"


def test_entrada_pago_inmutable():
    e = EntradaPago(monto=Decimal("2200.00"), fecha_negocio=date(2026, 1, 10), modo=ModoPago.NORMAL)
    with pytest.raises(dataclasses.FrozenInstanceError):
        e.monto = Decimal("0.00")  # type: ignore[misc]


def test_imputacion_campos():
    imp = Imputacion(
        concepto=ConceptoImputacion.INTERES_VENCIDO,
        monto=Decimal("200.00"),
        orden_waterfall=2,
        cuota_numero=1,
    )
    assert imp.orden_waterfall == 2
    assert imp.cuota_numero == 1


def test_estado_cuota_exigible():
    e = EstadoCuotaExigible(
        numero=1,
        vencimiento=date(2026, 1, 10),
        punitorio=Decimal("50.00"),
        interes=Decimal("200.00"),
        capital=Decimal("2000.00"),
    )
    assert e.total_exigible == Decimal("2250.00")
