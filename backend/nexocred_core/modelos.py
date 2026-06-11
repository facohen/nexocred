"""Value objects inmutables del core financiero."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import StrEnum

from nexocred_core.money import CERO, sumar


class Periodicidad(StrEnum):
    SEMANAL = "semanal"
    QUINCENAL = "quincenal"
    MENSUAL = "mensual"


class ModoPago(StrEnum):
    NORMAL = "normal"
    CANCELACION_ANTICIPADA = "cancelacion_anticipada"
    NOVACION = "novacion"


class ConceptoImputacion(StrEnum):
    PUNITORIO_VENCIDO = "punitorio_vencido"
    INTERES_VENCIDO = "interes_vencido"
    CAPITAL_VENCIDO = "capital_vencido"
    CARGO_EXIGIBLE = "cargo_exigible"
    INTERES_NO_VENCIDO = "interes_no_vencido"
    CAPITAL_NO_VENCIDO = "capital_no_vencido"
    EXCEDENTE = "excedente"


@dataclass(frozen=True)
class TerminosPrestamo:
    capital: Decimal
    tasa_interes_directo: Decimal  # tasa total sobre capital, p.ej. 0.10 = 10%
    cantidad_cuotas: int
    periodicidad: Periodicidad
    fecha_primera_cuota: date
    tasa_punitorio_diario: Decimal = Decimal("0")  # por dia de atraso sobre saldo vencido


@dataclass(frozen=True)
class FilaCronograma:
    numero: int
    vencimiento: date
    capital: Decimal
    interes: Decimal
    cuota: Decimal


@dataclass(frozen=True)
class Cronograma:
    filas: tuple[FilaCronograma, ...]

    @property
    def total_capital(self) -> Decimal:
        return sumar(*(f.capital for f in self.filas)) if self.filas else CERO

    @property
    def total_interes(self) -> Decimal:
        return sumar(*(f.interes for f in self.filas)) if self.filas else CERO

    @property
    def total_a_pagar(self) -> Decimal:
        return sumar(self.total_capital, self.total_interes)


@dataclass(frozen=True)
class EstadoCuotaExigible:
    numero: int
    vencimiento: date
    punitorio: Decimal
    interes: Decimal
    capital: Decimal

    @property
    def total_exigible(self) -> Decimal:
        return sumar(self.punitorio, self.interes, self.capital)


@dataclass(frozen=True)
class SaldoExigible:
    fecha_negocio: date
    cuotas: tuple[EstadoCuotaExigible, ...]
    capital_no_vencido: Decimal
    interes_no_vencido: Decimal

    @property
    def total_exigible(self) -> Decimal:
        return sumar(*(c.total_exigible for c in self.cuotas)) if self.cuotas else CERO


@dataclass(frozen=True)
class EntradaPago:
    monto: Decimal
    fecha_negocio: date
    modo: ModoPago = ModoPago.NORMAL


@dataclass(frozen=True)
class Imputacion:
    concepto: ConceptoImputacion
    monto: Decimal
    orden_waterfall: int
    cuota_numero: int | None = None


@dataclass(frozen=True)
class ResultadoPago:
    entrada: EntradaPago
    imputaciones: tuple[Imputacion, ...]
    excedente: Decimal

    @property
    def total_imputado(self) -> Decimal:
        montos = [
            i.monto for i in self.imputaciones if i.concepto is not ConceptoImputacion.EXCEDENTE
        ]
        return sumar(*montos) if montos else CERO


@dataclass(frozen=True)
class ResultadoPayoff:
    fecha_negocio: date
    capital: Decimal
    interes: Decimal
    punitorio: Decimal
    total: Decimal


@dataclass(frozen=True)
class ResultadoTolerancia:
    dentro_de_tolerancia: bool
    diferencia: Decimal
    ajuste: Decimal
    cuota_cerrada: bool


@dataclass(frozen=True)
class ResultadoCorreccion:
    reversas: tuple[Imputacion, ...]
    reemplazo: ResultadoPago = field(default=None)  # type: ignore[assignment]
