# Pre-F1 — `nexocred_core` Financial Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete, pure-Python `nexocred_core` financial engine (money normalization, direct-interest schedules, exigible-balance calculation, payment waterfall, payoff, collection tolerance, and pure correction) closed and green under golden + Hypothesis property tests, before any endpoint or UI depends on it.

**Architecture:** `nexocred_core` is a hard boundary (spec §5.1): pure, deterministic, `Decimal`-only, no I/O, no FastAPI/SQLAlchemy/Celery/Redis/DB-driver/settings, and **no system clock** — every date arrives as an explicit `fecha_negocio` parameter. Value objects are frozen dataclasses. Each calculation is a free function that takes value objects and returns value objects. Money flows through one rounding policy (`ROUND_HALF_UP`, 2 decimals). Business concepts are named in Spanish (`Prestamo`, `Cuota`, `Pago`, `aplicar_pago`, `calcular_cronograma`); `test`/`fixture`/etc. stay English per spec §5.0.

**Tech Stack:** Python 3.12, `decimal.Decimal`, frozen `dataclasses`, `enum`, pytest, Hypothesis. No third-party runtime deps in the core.

---

## Language and Naming Rule

Plans/docs may be English. Domain code is Spanish: class names, function names, enum members, field names representing business concepts (`Cuota.interes`, `concepto`, `orden_waterfall`). Common technical English is allowed (`test`, `fixture`, `snapshot`, `Decimal`). Error messages raised by the core are in Spanish (functional errors per spec §5.0).

## File Structure

All paths relative to repo root. `nexocred_core` is a top-level importable package because `pyproject.toml` sets `pythonpath = ["backend"]`; import as `from nexocred_core.money import ...`.

**Source — `backend/nexocred_core/`:**
- `money.py` — `Dinero` helpers: `dinero(...)` normalizer, `redondear(...)`, `sumar`/`restar`, `CENTAVO`/`CERO` constants, `ErrorDinero`. Rejects `float`. (spec §5.2)
- `errores.py` — stable domain error base `ErrorDominio` and subclasses (`ImporteNegativoError`, `TransicionInvalidaError`). (spec §5.6)
- `modelos.py` — frozen value objects: `TerminosPrestamo`, `FilaCronograma`, `Cronograma`, `EstadoCuotaExigible`, `SaldoExigible`, `EntradaPago`, `ModoPago` (enum), `ConceptoImputacion` (enum), `Imputacion`, `ResultadoPago`, `ResultadoPayoff`, `ResultadoTolerancia`, `ResultadoCorreccion`.
- `cronograma.py` — `calcular_cronograma(terminos)` direct-interest schedule. (spec §5: interés directo)
- `saldo.py` — `calcular_saldo_exigible(cronograma, imputaciones, fecha_negocio)`. (spec §5.3)
- `waterfall.py` — `aplicar_pago(saldo, entrada)` 7-step waterfall. (spec §5.4)
- `payoff.py` — `calcular_payoff(cronograma, imputaciones, fecha_negocio)` total cancellation. (spec §5.5 case 6)
- `tolerancia.py` — `aplicar_tolerancia(cuota_exigible, monto_pagado, tolerancia)`. (spec §5.5 case 8)
- `correccion.py` — `corregir_pago(resultado_original)` pure reversal + replacement. (spec §5.5 case 7)
- `__init__.py` — re-export the public surface.

**Tests — `backend/tests/core/`:**
- `__init__.py`
- `test_money.py`, `test_cronograma.py`, `test_saldo.py`, `test_waterfall.py`, `test_payoff.py`, `test_tolerancia.py`, `test_correccion.py`
- `test_casos_borde.py` — the 8 named §5.5 golden cases.
- `test_propiedades.py` — Hypothesis properties (conservación, determinismo, no-negatividad).
- `test_pureza.py` — asserts the core imports no forbidden module and no system clock.

---

## Conventions used throughout this plan

- **Money**: every amount is a `Decimal` quantized to 2 places, `ROUND_HALF_UP`. The helper `dinero(x)` accepts `Decimal | int | str`, **rejects `float`** with `ErrorDinero`, and returns a 2-place `Decimal`.
- **Tasas/porcentajes**: rates use higher scale (`Decimal` un-quantized to 2). They are NOT money; do not pass them through `dinero()`.
- **Dates**: plain `datetime.date`, always passed in. Never call `date.today()` inside the package.
- **Errors**: raise `ErrorDominio` subclasses with Spanish messages; never bare `ValueError` for domain rules.
- Run all core tests with: `pytest backend/tests/core -v`

---

## Task 1: Money primitives (`money.py`)

**Files:**
- Create: `backend/nexocred_core/money.py`
- Create: `backend/nexocred_core/errores.py`
- Create: `backend/tests/core/__init__.py`
- Test: `backend/tests/core/test_money.py`

- [ ] **Step 1: Create the test package init**

Create `backend/tests/core/__init__.py` as an empty file.

- [ ] **Step 2: Write failing tests for `money.py`**

Create `backend/tests/core/test_money.py`:

```python
from decimal import Decimal

import pytest

from nexocred_core.errores import ImporteNegativoError
from nexocred_core.money import CENTAVO, CERO, ErrorDinero, dinero, redondear, restar, sumar


def test_dinero_acepta_decimal_int_str():
    assert dinero(Decimal("10.005")) == Decimal("10.01")  # ROUND_HALF_UP
    assert dinero(10) == Decimal("10.00")
    assert dinero("14500.5") == Decimal("14500.50")


def test_dinero_redondea_half_up():
    assert dinero("0.005") == Decimal("0.01")
    assert dinero("2.675") == Decimal("2.68")


def test_dinero_rechaza_float():
    with pytest.raises(ErrorDinero):
        dinero(10.5)


def test_dinero_rechaza_none_y_texto_invalido():
    with pytest.raises(ErrorDinero):
        dinero("no-es-numero")
    with pytest.raises(ErrorDinero):
        dinero(None)  # type: ignore[arg-type]


def test_redondear_es_idempotente():
    assert redondear(dinero("3.14")) == Decimal("3.14")


def test_sumar_y_restar_quedan_quantizados():
    assert sumar(dinero("0.10"), dinero("0.20")) == Decimal("0.30")
    assert restar(dinero("1.00"), dinero("0.99")) == Decimal("0.01")


def test_constantes():
    assert CERO == Decimal("0.00")
    assert CENTAVO == Decimal("0.01")


def test_dinero_negativo_permitido_por_defecto_pero_validable():
    # dinero() en si permite negativos (reversas); la validacion es opt-in
    assert dinero("-5.00") == Decimal("-5.00")
    with pytest.raises(ImporteNegativoError):
        dinero("-5.00", permitir_negativo=False)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest backend/tests/core/test_money.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nexocred_core.money'`.

- [ ] **Step 4: Implement `errores.py`**

Create `backend/nexocred_core/errores.py`:

```python
"""Errores de dominio estables del core. Nunca usar excepciones genericas."""


class ErrorDominio(Exception):
    """Base de todos los errores de dominio del core."""


class ImporteNegativoError(ErrorDominio):
    """Un importe fue negativo donde no esta permitido."""


class TransicionInvalidaError(ErrorDominio):
    """Transicion de estado no permitida por la maquina de estados."""
```

- [ ] **Step 5: Implement `money.py`**

Create `backend/nexocred_core/money.py`:

```python
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest backend/tests/core/test_money.py -v`
Expected: PASS (all 7 tests).

- [ ] **Step 7: Lint and typecheck**

Run: `ruff check backend/nexocred_core/money.py backend/nexocred_core/errores.py && pyright backend/nexocred_core/money.py`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/nexocred_core/money.py backend/nexocred_core/errores.py backend/tests/core/__init__.py backend/tests/core/test_money.py
git commit -m "feat(core): money primitives con Decimal y rechazo de float"
```

---

## Task 2: Value objects (`modelos.py`)

**Files:**
- Create: `backend/nexocred_core/modelos.py`
- Test: `backend/tests/core/test_modelos.py`

These are the frozen dataclasses every later task consumes. Defining them up front locks the interface.

- [ ] **Step 1: Write failing tests for the value objects**

Create `backend/tests/core/test_modelos.py`:

```python
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
        FilaCronograma(1, date(2026, 1, 10), Decimal("2000.00"), Decimal("200.00"), Decimal("2200.00")),
        FilaCronograma(2, date(2026, 2, 10), Decimal("2000.00"), Decimal("200.00"), Decimal("2200.00")),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/core/test_modelos.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nexocred_core.modelos'`.

- [ ] **Step 3: Implement `modelos.py`**

Create `backend/nexocred_core/modelos.py`:

```python
"""Value objects inmutables del core financiero."""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum

from nexocred_core.money import CERO, sumar


class Periodicidad(str, Enum):
    SEMANAL = "semanal"
    QUINCENAL = "quincenal"
    MENSUAL = "mensual"


class ModoPago(str, Enum):
    NORMAL = "normal"
    CANCELACION_ANTICIPADA = "cancelacion_anticipada"
    NOVACION = "novacion"


class ConceptoImputacion(str, Enum):
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
        montos = [i.monto for i in self.imputaciones if i.concepto is not ConceptoImputacion.EXCEDENTE]
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/core/test_modelos.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `ruff check backend/nexocred_core/modelos.py && pyright backend/nexocred_core/modelos.py`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/nexocred_core/modelos.py backend/tests/core/test_modelos.py
git commit -m "feat(core): value objects inmutables (terminos, cronograma, pago, imputacion)"
```

---

## Task 3: Direct-interest schedule (`cronograma.py`)

Direct interest: total interest = `capital * tasa_interes_directo`, split evenly across cuotas; capital split evenly; last cuota absorbs rounding residue so totals reconcile exactly.

**Files:**
- Create: `backend/nexocred_core/cronograma.py`
- Test: `backend/tests/core/test_cronograma.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/core/test_cronograma.py`:

```python
from datetime import date
from decimal import Decimal

import pytest

from nexocred_core.cronograma import calcular_cronograma
from nexocred_core.errores import ErrorDominio
from nexocred_core.modelos import Periodicidad, TerminosPrestamo


def _terminos(**kw):
    base = dict(
        capital=Decimal("10000.00"),
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=5,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
        tasa_punitorio_diario=Decimal("0.001"),
    )
    base.update(kw)
    return TerminosPrestamo(**base)


def test_cantidad_de_filas_igual_a_cuotas():
    c = calcular_cronograma(_terminos())
    assert len(c.filas) == 5


def test_totales_reconcilian_exactamente():
    c = calcular_cronograma(_terminos())
    assert c.total_capital == Decimal("10000.00")
    assert c.total_interes == Decimal("1000.00")  # 10000 * 0.10
    assert c.total_a_pagar == Decimal("11000.00")


def test_cuota_pareja_cuando_divide_exacto():
    c = calcular_cronograma(_terminos())
    for f in c.filas:
        assert f.capital == Decimal("2000.00")
        assert f.interes == Decimal("200.00")
        assert f.cuota == Decimal("2200.00")


def test_residuo_de_redondeo_va_en_ultima_cuota():
    # 10000 / 3 = 3333.333... -> primeras 3333.33, ultima absorbe
    c = calcular_cronograma(_terminos(cantidad_cuotas=3, tasa_interes_directo=Decimal("0")))
    assert c.filas[0].capital == Decimal("3333.33")
    assert c.filas[1].capital == Decimal("3333.33")
    assert c.filas[2].capital == Decimal("3333.34")
    assert c.total_capital == Decimal("10000.00")


def test_vencimientos_mensuales_consecutivos():
    c = calcular_cronograma(_terminos(cantidad_cuotas=3))
    assert c.filas[0].vencimiento == date(2026, 1, 10)
    assert c.filas[1].vencimiento == date(2026, 2, 10)
    assert c.filas[2].vencimiento == date(2026, 3, 10)


def test_vencimientos_semanales():
    c = calcular_cronograma(_terminos(periodicidad=Periodicidad.SEMANAL, cantidad_cuotas=2))
    assert c.filas[0].vencimiento == date(2026, 1, 10)
    assert c.filas[1].vencimiento == date(2026, 1, 17)


def test_rechaza_cantidad_cuotas_invalida():
    with pytest.raises(ErrorDominio):
        calcular_cronograma(_terminos(cantidad_cuotas=0))


def test_rechaza_capital_no_positivo():
    with pytest.raises(ErrorDominio):
        calcular_cronograma(_terminos(capital=Decimal("0.00")))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/core/test_cronograma.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nexocred_core.cronograma'`.

- [ ] **Step 3: Implement `cronograma.py`**

Create `backend/nexocred_core/cronograma.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/core/test_cronograma.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `ruff check backend/nexocred_core/cronograma.py && pyright backend/nexocred_core/cronograma.py`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/nexocred_core/cronograma.py backend/tests/core/test_cronograma.py
git commit -m "feat(core): cronograma por interes directo con reconciliacion exacta"
```

---

## Task 4: Exigible balance by `fecha_negocio` (`saldo.py`)

Given the schedule, the imputations already applied, and a `fecha_negocio`, compute what is currently exigible (overdue cuotas with their punitorio) and what remains not-yet-due. Punitorio = `tasa_punitorio_diario * capital_de_cuota_vencido * dias_de_atraso`. Imputations already applied reduce the per-cuota outstanding capital/interest.

**Files:**
- Create: `backend/nexocred_core/saldo.py`
- Test: `backend/tests/core/test_saldo.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/core/test_saldo.py`:

```python
from datetime import date
from decimal import Decimal

from nexocred_core.cronograma import calcular_cronograma
from nexocred_core.modelos import (
    ConceptoImputacion,
    Imputacion,
    Periodicidad,
    TerminosPrestamo,
)
from nexocred_core.saldo import calcular_saldo_exigible


def _cronograma():
    return calcular_cronograma(
        TerminosPrestamo(
            capital=Decimal("10000.00"),
            tasa_interes_directo=Decimal("0.10"),
            cantidad_cuotas=5,
            periodicidad=Periodicidad.MENSUAL,
            fecha_primera_cuota=date(2026, 1, 10),
            tasa_punitorio_diario=Decimal("0.001"),
        )
    )


def test_nada_exigible_antes_de_primer_vencimiento():
    saldo = calcular_saldo_exigible(_cronograma(), (), date(2026, 1, 9), Decimal("0.001"))
    assert saldo.total_exigible == Decimal("0.00")
    assert len(saldo.cuotas) == 0
    assert saldo.capital_no_vencido == Decimal("10000.00")
    assert saldo.interes_no_vencido == Decimal("1000.00")


def test_una_cuota_vencida_exacta_sin_atraso():
    # En la fecha de vencimiento, exigible = cuota, punitorio = 0
    saldo = calcular_saldo_exigible(_cronograma(), (), date(2026, 1, 10), Decimal("0.001"))
    assert len(saldo.cuotas) == 1
    c = saldo.cuotas[0]
    assert c.punitorio == Decimal("0.00")
    assert c.interes == Decimal("200.00")
    assert c.capital == Decimal("2000.00")
    assert c.total_exigible == Decimal("2200.00")


def test_punitorio_por_dias_de_atraso():
    # 10 dias de atraso sobre capital 2000 a 0.001/dia = 2000*0.001*10 = 20.00
    saldo = calcular_saldo_exigible(_cronograma(), (), date(2026, 1, 20), Decimal("0.001"))
    c = saldo.cuotas[0]
    assert c.punitorio == Decimal("20.00")


def test_dos_cuotas_vencidas_se_acumulan():
    saldo = calcular_saldo_exigible(_cronograma(), (), date(2026, 2, 10), Decimal("0.001"))
    assert len(saldo.cuotas) == 2
    assert saldo.capital_no_vencido == Decimal("6000.00")  # 3 cuotas * 2000


def test_imputacion_previa_reduce_lo_exigible():
    # ya se imputaron 2000 a capital_vencido de cuota 1
    imps = (
        Imputacion(ConceptoImputacion.CAPITAL_VENCIDO, Decimal("2000.00"), 3, cuota_numero=1),
        Imputacion(ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00"), 2, cuota_numero=1),
    )
    saldo = calcular_saldo_exigible(_cronograma(), imps, date(2026, 1, 10), Decimal("0.001"))
    # cuota 1 ya saldada -> no exigible
    assert all(c.numero != 1 or c.total_exigible == Decimal("0.00") for c in saldo.cuotas)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/core/test_saldo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nexocred_core.saldo'`.

- [ ] **Step 3: Implement `saldo.py`**

Create `backend/nexocred_core/saldo.py`:

```python
"""Calculo de saldo exigible por fecha de negocio. Puro."""

from datetime import date
from decimal import Decimal

from nexocred_core.modelos import (
    ConceptoImputacion,
    Cronograma,
    EstadoCuotaExigible,
    Imputacion,
    SaldoExigible,
)
from nexocred_core.money import CERO, redondear, restar, sumar


def _imputado(imps: tuple[Imputacion, ...], cuota_numero: int, concepto: ConceptoImputacion) -> Decimal:
    montos = [i.monto for i in imps if i.cuota_numero == cuota_numero and i.concepto is concepto]
    return sumar(*montos) if montos else CERO


def calcular_saldo_exigible(
    cronograma: Cronograma,
    imputaciones: tuple[Imputacion, ...],
    fecha_negocio: date,
    tasa_punitorio_diario: Decimal,
) -> SaldoExigible:
    cuotas_exigibles: list[EstadoCuotaExigible] = []
    capital_no_vencido = CERO
    interes_no_vencido = CERO

    for fila in cronograma.filas:
        if fila.vencimiento <= fecha_negocio:
            capital_pend = restar(
                fila.capital, _imputado(imputaciones, fila.numero, ConceptoImputacion.CAPITAL_VENCIDO)
            )
            interes_pend = restar(
                fila.interes, _imputado(imputaciones, fila.numero, ConceptoImputacion.INTERES_VENCIDO)
            )
            capital_pend = max(capital_pend, CERO)
            interes_pend = max(interes_pend, CERO)

            dias_atraso = (fecha_negocio - fila.vencimiento).days
            punitorio_bruto = redondear(
                capital_pend * tasa_punitorio_diario * Decimal(dias_atraso)
            )
            punitorio_pagado = _imputado(imputaciones, fila.numero, ConceptoImputacion.PUNITORIO_VENCIDO)
            punitorio_pend = max(restar(punitorio_bruto, punitorio_pagado), CERO)

            cuotas_exigibles.append(
                EstadoCuotaExigible(
                    numero=fila.numero,
                    vencimiento=fila.vencimiento,
                    punitorio=punitorio_pend,
                    interes=interes_pend,
                    capital=capital_pend,
                )
            )
        else:
            capital_no_vencido = sumar(capital_no_vencido, fila.capital)
            interes_no_vencido = sumar(interes_no_vencido, fila.interes)

    return SaldoExigible(
        fecha_negocio=fecha_negocio,
        cuotas=tuple(cuotas_exigibles),
        capital_no_vencido=capital_no_vencido,
        interes_no_vencido=interes_no_vencido,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/core/test_saldo.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `ruff check backend/nexocred_core/saldo.py && pyright backend/nexocred_core/saldo.py`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/nexocred_core/saldo.py backend/tests/core/test_saldo.py
git commit -m "feat(core): saldo exigible por fecha_negocio con punitorio por atraso"
```

---

## Task 5: Payment waterfall (`waterfall.py`)

Implements the exact 7-step order from spec §5.4. Walks exigible cuotas oldest-first; within each cuota applies punitorio → interés → capital. Steps 5–6 (interés/capital no vencido) only apply when `modo` is `CANCELACION_ANTICIPADA` or `NOVACION`. Anything left after step 6 is `EXCEDENTE`. **Invariant:** `total_imputado + excedente == entrada.monto` exactly.

**Files:**
- Create: `backend/nexocred_core/waterfall.py`
- Test: `backend/tests/core/test_waterfall.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/core/test_waterfall.py`:

```python
from datetime import date
from decimal import Decimal

from nexocred_core.modelos import (
    ConceptoImputacion,
    EntradaPago,
    EstadoCuotaExigible,
    ModoPago,
    SaldoExigible,
)
from nexocred_core.waterfall import aplicar_pago


def _saldo_una_cuota(punitorio="50.00", interes="200.00", capital="2000.00"):
    return SaldoExigible(
        fecha_negocio=date(2026, 1, 20),
        cuotas=(
            EstadoCuotaExigible(
                numero=1,
                vencimiento=date(2026, 1, 10),
                punitorio=Decimal(punitorio),
                interes=Decimal(interes),
                capital=Decimal(capital),
            ),
        ),
        capital_no_vencido=Decimal("8000.00"),
        interes_no_vencido=Decimal("800.00"),
    )


def _conceptos(res):
    return [(i.concepto, i.monto) for i in res.imputaciones]


def test_conservacion_imputado_mas_excedente_igual_monto():
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("2250.00"), date(2026, 1, 20)))
    assert res.total_imputado + res.excedente == Decimal("2250.00")


def test_pago_exacto_liquida_en_orden():
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("2250.00"), date(2026, 1, 20)))
    assert _conceptos(res) == [
        (ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("50.00")),
        (ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00")),
        (ConceptoImputacion.CAPITAL_VENCIDO, Decimal("2000.00")),
    ]
    assert res.excedente == Decimal("0.00")


def test_pago_parcial_menor_al_punitorio():
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("30.00"), date(2026, 1, 20)))
    assert _conceptos(res) == [(ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("30.00"))]
    assert res.excedente == Decimal("0.00")


def test_pago_parcial_cruza_conceptos():
    # 50 punitorio + 200 interes + 100 de capital
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("350.00"), date(2026, 1, 20)))
    assert _conceptos(res) == [
        (ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("50.00")),
        (ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00")),
        (ConceptoImputacion.CAPITAL_VENCIDO, Decimal("100.00")),
    ]


def test_pago_mayor_al_exigible_genera_excedente_en_modo_normal():
    res = aplicar_pago(_saldo_una_cuota(), EntradaPago(Decimal("3000.00"), date(2026, 1, 20)))
    assert res.excedente == Decimal("750.00")  # 3000 - 2250
    assert all(i.concepto is not ConceptoImputacion.CAPITAL_NO_VENCIDO for i in res.imputaciones)


def test_cancelacion_anticipada_imputa_no_vencido():
    entrada = EntradaPago(Decimal("11050.00"), date(2026, 1, 20), modo=ModoPago.CANCELACION_ANTICIPADA)
    res = aplicar_pago(_saldo_una_cuota(), entrada)
    conceptos = {i.concepto for i in res.imputaciones}
    assert ConceptoImputacion.INTERES_NO_VENCIDO in conceptos
    assert ConceptoImputacion.CAPITAL_NO_VENCIDO in conceptos
    # 50+200+2000 exigible + 800 int no venc + 8000 cap no venc = 11050
    assert res.excedente == Decimal("0.00")
    assert res.total_imputado == Decimal("11050.00")


def test_pago_anticipado_no_cancelatorio_no_toca_no_vencido():
    saldo = SaldoExigible(
        fecha_negocio=date(2026, 1, 5),
        cuotas=(),
        capital_no_vencido=Decimal("10000.00"),
        interes_no_vencido=Decimal("1000.00"),
    )
    res = aplicar_pago(saldo, EntradaPago(Decimal("500.00"), date(2026, 1, 5)))
    assert res.excedente == Decimal("500.00")
    assert res.imputaciones == () or all(
        i.concepto is ConceptoImputacion.EXCEDENTE for i in res.imputaciones
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/core/test_waterfall.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nexocred_core.waterfall'`.

- [ ] **Step 3: Implement `waterfall.py`**

Create `backend/nexocred_core/waterfall.py`:

```python
"""Waterfall de imputacion de pagos en el orden obligatorio de spec 5.4."""

from decimal import Decimal

from nexocred_core.modelos import (
    ConceptoImputacion,
    EntradaPago,
    Imputacion,
    ModoPago,
    ResultadoPago,
    SaldoExigible,
)
from nexocred_core.money import CERO

_MODOS_CANCELATORIOS = {ModoPago.CANCELACION_ANTICIPADA, ModoPago.NOVACION}


def aplicar_pago(saldo: SaldoExigible, entrada: EntradaPago) -> ResultadoPago:
    restante = entrada.monto
    imputaciones: list[Imputacion] = []

    def imputar(concepto: ConceptoImputacion, disponible: Decimal, orden: int, cuota: int | None) -> None:
        nonlocal restante
        if restante <= CERO or disponible <= CERO:
            return
        monto = min(restante, disponible)
        imputaciones.append(Imputacion(concepto, monto, orden, cuota_numero=cuota))
        restante = restante - monto

    # Pasos 1-3 por cuota vencida, mas antigua primero
    for cuota in sorted(saldo.cuotas, key=lambda c: c.vencimiento):
        imputar(ConceptoImputacion.PUNITORIO_VENCIDO, cuota.punitorio, 1, cuota.numero)
        imputar(ConceptoImputacion.INTERES_VENCIDO, cuota.interes, 2, cuota.numero)
        imputar(ConceptoImputacion.CAPITAL_VENCIDO, cuota.capital, 3, cuota.numero)

    # Paso 4: cargos exigibles -> no modelados como saldo en el core por ahora (sin datos)

    # Pasos 5-6: solo en modo cancelatorio/novacion
    if entrada.modo in _MODOS_CANCELATORIOS:
        imputar(ConceptoImputacion.INTERES_NO_VENCIDO, saldo.interes_no_vencido, 5, None)
        imputar(ConceptoImputacion.CAPITAL_NO_VENCIDO, saldo.capital_no_vencido, 6, None)

    # Paso 7: excedente no aplicado
    excedente = restante if restante > CERO else CERO

    return ResultadoPago(
        entrada=entrada,
        imputaciones=tuple(imputaciones),
        excedente=excedente,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/core/test_waterfall.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `ruff check backend/nexocred_core/waterfall.py && pyright backend/nexocred_core/waterfall.py`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/nexocred_core/waterfall.py backend/tests/core/test_waterfall.py
git commit -m "feat(core): waterfall de pagos en orden obligatorio spec 5.4"
```

---

## Task 6: Payoff for total cancellation (`payoff.py`)

`calcular_payoff` returns the total amount to fully cancel at a `fecha_negocio`: all exigible punitorio + all interest (vencido + no vencido) + all capital (vencido + no vencido), net of prior imputations. Reuses `calcular_saldo_exigible`.

**Files:**
- Create: `backend/nexocred_core/payoff.py`
- Test: `backend/tests/core/test_payoff.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/core/test_payoff.py`:

```python
from datetime import date
from decimal import Decimal

from nexocred_core.cronograma import calcular_cronograma
from nexocred_core.modelos import Periodicidad, TerminosPrestamo
from nexocred_core.payoff import calcular_payoff


def _cronograma():
    return calcular_cronograma(
        TerminosPrestamo(
            capital=Decimal("10000.00"),
            tasa_interes_directo=Decimal("0.10"),
            cantidad_cuotas=5,
            periodicidad=Periodicidad.MENSUAL,
            fecha_primera_cuota=date(2026, 1, 10),
            tasa_punitorio_diario=Decimal("0.001"),
        )
    )


def test_payoff_sin_atraso_es_capital_mas_interes_total():
    # antes del primer vencimiento, nada exigible/punitorio
    res = calcular_payoff(_cronograma(), (), date(2026, 1, 9), Decimal("0.001"))
    assert res.capital == Decimal("10000.00")
    assert res.interes == Decimal("1000.00")
    assert res.punitorio == Decimal("0.00")
    assert res.total == Decimal("11000.00")


def test_payoff_incluye_punitorio_de_cuotas_vencidas():
    # cuota 1 vencida 10 dias: punitorio 2000*0.001*10 = 20
    res = calcular_payoff(_cronograma(), (), date(2026, 1, 20), Decimal("0.001"))
    assert res.punitorio == Decimal("20.00")
    assert res.total == Decimal("11020.00")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/core/test_payoff.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nexocred_core.payoff'`.

- [ ] **Step 3: Implement `payoff.py`**

Create `backend/nexocred_core/payoff.py`:

```python
"""Calculo de cancelacion total anticipada (payoff) a una fecha de negocio."""

from datetime import date
from decimal import Decimal

from nexocred_core.modelos import Cronograma, Imputacion, ResultadoPayoff
from nexocred_core.money import sumar
from nexocred_core.saldo import calcular_saldo_exigible


def calcular_payoff(
    cronograma: Cronograma,
    imputaciones: tuple[Imputacion, ...],
    fecha_negocio: date,
    tasa_punitorio_diario: Decimal,
) -> ResultadoPayoff:
    saldo = calcular_saldo_exigible(cronograma, imputaciones, fecha_negocio, tasa_punitorio_diario)

    punitorio = sumar(*(c.punitorio for c in saldo.cuotas)) if saldo.cuotas else sumar()
    interes_vencido = sumar(*(c.interes for c in saldo.cuotas)) if saldo.cuotas else sumar()
    capital_vencido = sumar(*(c.capital for c in saldo.cuotas)) if saldo.cuotas else sumar()

    capital = sumar(capital_vencido, saldo.capital_no_vencido)
    interes = sumar(interes_vencido, saldo.interes_no_vencido)
    total = sumar(capital, interes, punitorio)

    return ResultadoPayoff(
        fecha_negocio=fecha_negocio,
        capital=capital,
        interes=interes,
        punitorio=punitorio,
        total=total,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/core/test_payoff.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `ruff check backend/nexocred_core/payoff.py && pyright backend/nexocred_core/payoff.py`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/nexocred_core/payoff.py backend/tests/core/test_payoff.py
git commit -m "feat(core): payoff de cancelacion total anticipada"
```

---

## Task 7: Collection tolerance (`tolerancia.py`)

If the shortfall against the exigible cuota is within configured tolerance, the cuota may be closed and a tolerance adjustment recorded; if it exceeds tolerance, balance stays pending. Tolerance is an absolute money amount here.

**Files:**
- Create: `backend/nexocred_core/tolerancia.py`
- Test: `backend/tests/core/test_tolerancia.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/core/test_tolerancia.py`:

```python
from decimal import Decimal

from nexocred_core.tolerancia import aplicar_tolerancia


def test_dentro_de_tolerancia_cierra_cuota():
    res = aplicar_tolerancia(
        cuota_exigible=Decimal("2200.00"),
        monto_pagado=Decimal("2199.50"),
        tolerancia=Decimal("1.00"),
    )
    assert res.dentro_de_tolerancia is True
    assert res.diferencia == Decimal("0.50")
    assert res.ajuste == Decimal("0.50")
    assert res.cuota_cerrada is True


def test_fuera_de_tolerancia_mantiene_saldo():
    res = aplicar_tolerancia(
        cuota_exigible=Decimal("2200.00"),
        monto_pagado=Decimal("2100.00"),
        tolerancia=Decimal("1.00"),
    )
    assert res.dentro_de_tolerancia is False
    assert res.diferencia == Decimal("100.00")
    assert res.ajuste == Decimal("0.00")
    assert res.cuota_cerrada is False


def test_pago_exacto_no_genera_ajuste():
    res = aplicar_tolerancia(Decimal("2200.00"), Decimal("2200.00"), Decimal("1.00"))
    assert res.dentro_de_tolerancia is True
    assert res.ajuste == Decimal("0.00")
    assert res.cuota_cerrada is True


def test_sobrepago_no_es_diferencia_a_tolerar():
    res = aplicar_tolerancia(Decimal("2200.00"), Decimal("2300.00"), Decimal("1.00"))
    assert res.diferencia == Decimal("0.00")
    assert res.cuota_cerrada is True
    assert res.ajuste == Decimal("0.00")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/core/test_tolerancia.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nexocred_core.tolerancia'`.

- [ ] **Step 3: Implement `tolerancia.py`**

Create `backend/nexocred_core/tolerancia.py`:

```python
"""Tolerancia de cobro: cierra cuota si la diferencia esta dentro del umbral."""

from decimal import Decimal

from nexocred_core.modelos import ResultadoTolerancia
from nexocred_core.money import CERO, restar


def aplicar_tolerancia(
    cuota_exigible: Decimal,
    monto_pagado: Decimal,
    tolerancia: Decimal,
) -> ResultadoTolerancia:
    faltante = restar(cuota_exigible, monto_pagado)
    diferencia = faltante if faltante > CERO else CERO
    dentro = diferencia <= tolerancia
    ajuste = diferencia if dentro else CERO
    return ResultadoTolerancia(
        dentro_de_tolerancia=dentro,
        diferencia=diferencia,
        ajuste=ajuste,
        cuota_cerrada=dentro,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/core/test_tolerancia.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `ruff check backend/nexocred_core/tolerancia.py && pyright backend/nexocred_core/tolerancia.py`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/nexocred_core/tolerancia.py backend/tests/core/test_tolerancia.py
git commit -m "feat(core): tolerancia de cobro con ajuste y cierre de cuota"
```

---

## Task 8: Pure correction (`correccion.py`)

Correction = full reversal of the original payment's imputations (sign-flipped contra-asientos) plus a fresh replacement payment computed from scratch. No persistence concerns: the function takes the original `ResultadoPago` and the recomputed replacement `ResultadoPago`, and returns a `ResultadoCorreccion` whose `reversas` exactly negate the original imputations. (spec §5.5 case 7)

**Files:**
- Create: `backend/nexocred_core/correccion.py`
- Test: `backend/tests/core/test_correccion.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/core/test_correccion.py`:

```python
from datetime import date
from decimal import Decimal

from nexocred_core.correccion import corregir_pago
from nexocred_core.modelos import (
    ConceptoImputacion,
    EntradaPago,
    Imputacion,
    ResultadoPago,
)


def _resultado_original():
    return ResultadoPago(
        entrada=EntradaPago(Decimal("2250.00"), date(2026, 1, 20)),
        imputaciones=(
            Imputacion(ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("50.00"), 1, cuota_numero=1),
            Imputacion(ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00"), 2, cuota_numero=1),
            Imputacion(ConceptoImputacion.CAPITAL_VENCIDO, Decimal("2000.00"), 3, cuota_numero=1),
        ),
        excedente=Decimal("0.00"),
    )


def _resultado_reemplazo():
    return ResultadoPago(
        entrada=EntradaPago(Decimal("250.00"), date(2026, 1, 20)),
        imputaciones=(
            Imputacion(ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("50.00"), 1, cuota_numero=1),
            Imputacion(ConceptoImputacion.INTERES_VENCIDO, Decimal("200.00"), 2, cuota_numero=1),
        ),
        excedente=Decimal("0.00"),
    )


def test_reversas_niegan_cada_imputacion_original():
    res = corregir_pago(_resultado_original(), _resultado_reemplazo())
    assert len(res.reversas) == 3
    assert res.reversas[0].monto == Decimal("-50.00")
    assert res.reversas[1].monto == Decimal("-200.00")
    assert res.reversas[2].monto == Decimal("-2000.00")
    # conceptos y cuota preservados para trazabilidad
    assert res.reversas[0].concepto is ConceptoImputacion.PUNITORIO_VENCIDO
    assert res.reversas[2].cuota_numero == 1


def test_suma_reversas_anula_original():
    original = _resultado_original()
    res = corregir_pago(original, _resultado_reemplazo())
    suma_original = sum(i.monto for i in original.imputaciones)
    suma_reversas = sum(i.monto for i in res.reversas)
    assert suma_original + suma_reversas == Decimal("0.00")


def test_reemplazo_se_conserva_intacto():
    reemplazo = _resultado_reemplazo()
    res = corregir_pago(_resultado_original(), reemplazo)
    assert res.reemplazo is reemplazo
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/core/test_correccion.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nexocred_core.correccion'`.

- [ ] **Step 3: Implement `correccion.py`**

Create `backend/nexocred_core/correccion.py`:

```python
"""Correccion pura: reversa total del pago original + pago de reemplazo. Sin persistencia."""

from nexocred_core.modelos import Imputacion, ResultadoCorreccion, ResultadoPago


def corregir_pago(original: ResultadoPago, reemplazo: ResultadoPago) -> ResultadoCorreccion:
    reversas = tuple(
        Imputacion(
            concepto=imp.concepto,
            monto=-imp.monto,
            orden_waterfall=imp.orden_waterfall,
            cuota_numero=imp.cuota_numero,
        )
        for imp in original.imputaciones
    )
    return ResultadoCorreccion(reversas=reversas, reemplazo=reemplazo)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/core/test_correccion.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `ruff check backend/nexocred_core/correccion.py && pyright backend/nexocred_core/correccion.py`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/nexocred_core/correccion.py backend/tests/core/test_correccion.py
git commit -m "feat(core): correccion pura como reversa + reemplazo"
```

---

## Task 9: Public surface (`__init__.py`)

Re-export the public API so callers do `from nexocred_core import aplicar_pago, calcular_cronograma, ...`.

**Files:**
- Modify: `backend/nexocred_core/__init__.py`
- Test: `backend/tests/core/test_api_publica.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/core/test_api_publica.py`:

```python
import nexocred_core as core


def test_superficie_publica_exportada():
    nombres = {
        "dinero",
        "redondear",
        "calcular_cronograma",
        "calcular_saldo_exigible",
        "aplicar_pago",
        "calcular_payoff",
        "aplicar_tolerancia",
        "corregir_pago",
        "TerminosPrestamo",
        "EntradaPago",
        "ModoPago",
        "ConceptoImputacion",
        "ErrorDominio",
    }
    faltantes = nombres - set(dir(core))
    assert not faltantes, f"faltan exports: {faltantes}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/core/test_api_publica.py -v`
Expected: FAIL — names missing from `nexocred_core`.

- [ ] **Step 3: Implement `__init__.py`**

Replace `backend/nexocred_core/__init__.py` with:

```python
"""nexocred_core: motor financiero puro y deterministico (Decimal, sin I/O)."""

from nexocred_core.correccion import corregir_pago
from nexocred_core.cronograma import calcular_cronograma
from nexocred_core.errores import (
    ErrorDominio,
    ImporteNegativoError,
    TransicionInvalidaError,
)
from nexocred_core.modelos import (
    ConceptoImputacion,
    Cronograma,
    EntradaPago,
    EstadoCuotaExigible,
    FilaCronograma,
    Imputacion,
    ModoPago,
    Periodicidad,
    ResultadoCorreccion,
    ResultadoPago,
    ResultadoPayoff,
    ResultadoTolerancia,
    SaldoExigible,
    TerminosPrestamo,
)
from nexocred_core.money import CENTAVO, CERO, ErrorDinero, dinero, redondear, restar, sumar
from nexocred_core.payoff import calcular_payoff
from nexocred_core.saldo import calcular_saldo_exigible
from nexocred_core.tolerancia import aplicar_tolerancia
from nexocred_core.waterfall import aplicar_pago

__all__ = [
    "CENTAVO",
    "CERO",
    "ConceptoImputacion",
    "Cronograma",
    "EntradaPago",
    "ErrorDinero",
    "ErrorDominio",
    "EstadoCuotaExigible",
    "FilaCronograma",
    "ImporteNegativoError",
    "Imputacion",
    "ModoPago",
    "Periodicidad",
    "ResultadoCorreccion",
    "ResultadoPago",
    "ResultadoPayoff",
    "ResultadoTolerancia",
    "SaldoExigible",
    "TerminosPrestamo",
    "TransicionInvalidaError",
    "aplicar_pago",
    "aplicar_tolerancia",
    "calcular_cronograma",
    "calcular_payoff",
    "calcular_saldo_exigible",
    "corregir_pago",
    "dinero",
    "redondear",
    "restar",
    "sumar",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/core/test_api_publica.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/nexocred_core/__init__.py backend/tests/core/test_api_publica.py
git commit -m "feat(core): exportar superficie publica de nexocred_core"
```

---

## Task 10: The 8 named edge cases (`test_casos_borde.py`)

Spec §5.5 requires the 8 minimum cases represented as **named** tests. Several behaviors are already covered piecewise; this file makes each of the 8 an explicit, named, end-to-end golden test wired through the public API. This is the Pre-F1 contract.

**Files:**
- Test: `backend/tests/core/test_casos_borde.py`

- [ ] **Step 1: Write the 8 named golden tests**

Create `backend/tests/core/test_casos_borde.py`:

```python
"""Los 8 casos borde minimos de spec 5.5. Contrato de cierre de Pre-F1."""

from datetime import date
from decimal import Decimal

from nexocred_core import (
    ConceptoImputacion,
    EntradaPago,
    ModoPago,
    Periodicidad,
    TerminosPrestamo,
    aplicar_pago,
    aplicar_tolerancia,
    calcular_cronograma,
    calcular_payoff,
    calcular_saldo_exigible,
    corregir_pago,
)

TASA_PUNITORIO = Decimal("0.001")


def _terminos():
    return TerminosPrestamo(
        capital=Decimal("10000.00"),
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=5,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
        tasa_punitorio_diario=TASA_PUNITORIO,
    )


def _saldo(fecha, imputaciones=()):
    return calcular_saldo_exigible(calcular_cronograma(_terminos()), imputaciones, fecha, TASA_PUNITORIO)


def test_caso_1_pago_exacto_de_cuota_vencida():
    # fecha de vencimiento exacta: cuota = 2200, punitorio 0
    saldo = _saldo(date(2026, 1, 10))
    res = aplicar_pago(saldo, EntradaPago(Decimal("2200.00"), date(2026, 1, 10)))
    assert res.excedente == Decimal("0.00")
    assert res.total_imputado == Decimal("2200.00")


def test_caso_2_pago_parcial_menor_al_punitorio():
    saldo = _saldo(date(2026, 1, 20))  # 10 dias atraso -> punitorio 20.00
    res = aplicar_pago(saldo, EntradaPago(Decimal("10.00"), date(2026, 1, 20)))
    assert [i.concepto for i in res.imputaciones] == [ConceptoImputacion.PUNITORIO_VENCIDO]
    assert res.imputaciones[0].monto == Decimal("10.00")


def test_caso_3_pago_parcial_cruza_conceptos():
    saldo = _saldo(date(2026, 1, 20))  # punitorio 20, interes 200, capital 2000
    res = aplicar_pago(saldo, EntradaPago(Decimal("100.00"), date(2026, 1, 20)))
    conceptos = [(i.concepto, i.monto) for i in res.imputaciones]
    assert conceptos == [
        (ConceptoImputacion.PUNITORIO_VENCIDO, Decimal("20.00")),
        (ConceptoImputacion.INTERES_VENCIDO, Decimal("80.00")),
    ]


def test_caso_4_pago_mayor_al_exigible_registra_excedente():
    saldo = _saldo(date(2026, 1, 10))  # exigible 2200
    res = aplicar_pago(saldo, EntradaPago(Decimal("2500.00"), date(2026, 1, 10)))
    assert res.excedente == Decimal("300.00")


def test_caso_5_pago_anticipado_no_cancelatorio_no_imputa_no_vencido():
    saldo = _saldo(date(2026, 1, 5))  # nada vencido aun
    res = aplicar_pago(saldo, EntradaPago(Decimal("1000.00"), date(2026, 1, 5)))
    assert res.excedente == Decimal("1000.00")
    assert res.imputaciones == ()


def test_caso_6_cancelacion_anticipada_total():
    cronograma = calcular_cronograma(_terminos())
    payoff = calcular_payoff(cronograma, (), date(2026, 1, 9), TASA_PUNITORIO)
    saldo = calcular_saldo_exigible(cronograma, (), date(2026, 1, 9), TASA_PUNITORIO)
    res = aplicar_pago(
        saldo,
        EntradaPago(payoff.total, date(2026, 1, 9), modo=ModoPago.CANCELACION_ANTICIPADA),
    )
    assert res.total_imputado == payoff.total
    assert res.excedente == Decimal("0.00")


def test_caso_7_correccion_1_clic():
    saldo = _saldo(date(2026, 1, 10))
    original = aplicar_pago(saldo, EntradaPago(Decimal("2200.00"), date(2026, 1, 10)))
    reemplazo = aplicar_pago(saldo, EntradaPago(Decimal("500.00"), date(2026, 1, 10)))
    correccion = corregir_pago(original, reemplazo)
    suma_orig = sum(i.monto for i in original.imputaciones)
    suma_rev = sum(i.monto for i in correccion.reversas)
    assert suma_orig + suma_rev == Decimal("0.00")
    assert correccion.reemplazo is reemplazo


def test_caso_8_tolerancia_de_cobro():
    dentro = aplicar_tolerancia(Decimal("2200.00"), Decimal("2199.50"), Decimal("1.00"))
    assert dentro.cuota_cerrada is True
    fuera = aplicar_tolerancia(Decimal("2200.00"), Decimal("2100.00"), Decimal("1.00"))
    assert fuera.cuota_cerrada is False
```

- [ ] **Step 2: Run the 8 cases**

Run: `pytest backend/tests/core/test_casos_borde.py -v`
Expected: PASS — exactly 8 named tests `test_caso_1_...` through `test_caso_8_...`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/core/test_casos_borde.py
git commit -m "test(core): 8 casos borde minimos de spec 5.5 como golden tests"
```

---

## Task 11: Hypothesis properties (`test_propiedades.py`)

Property-based invariants per master-plan Stage 1: **conservation of money** (imputado + excedente == monto), **deterministic output** (same inputs → same result), **non-negative balances** (exigible amounts never go negative). Strategies build `Decimal` money via strings (never `float`).

**Files:**
- Test: `backend/tests/core/test_propiedades.py`

- [ ] **Step 1: Write the property tests**

Create `backend/tests/core/test_propiedades.py`:

```python
"""Propiedades (Hypothesis): conservacion, determinismo, no-negatividad."""

from datetime import date
from decimal import Decimal

from hypothesis import given, settings
from hypothesis import strategies as st

from nexocred_core import (
    EntradaPago,
    EstadoCuotaExigible,
    ModoPago,
    Periodicidad,
    SaldoExigible,
    TerminosPrestamo,
    aplicar_pago,
    calcular_cronograma,
    calcular_saldo_exigible,
)

# Estrategia de dinero: enteros de centavos -> Decimal de 2 decimales, sin float.
montos = st.integers(min_value=0, max_value=10_000_00).map(lambda c: (Decimal(c) / Decimal(100)).quantize(Decimal("0.01")))
montos_positivos = st.integers(min_value=1, max_value=10_000_00).map(lambda c: (Decimal(c) / Decimal(100)).quantize(Decimal("0.01")))


def _saldo(punitorio, interes, capital):
    return SaldoExigible(
        fecha_negocio=date(2026, 1, 20),
        cuotas=(
            EstadoCuotaExigible(1, date(2026, 1, 10), punitorio, interes, capital),
        ),
        capital_no_vencido=Decimal("0.00"),
        interes_no_vencido=Decimal("0.00"),
    )


@settings(max_examples=200)
@given(p=montos, i=montos, c=montos, pago=montos)
def test_conservacion_de_dinero(p, i, c, pago):
    res = aplicar_pago(_saldo(p, i, c), EntradaPago(pago, date(2026, 1, 20)))
    assert res.total_imputado + res.excedente == pago


@settings(max_examples=200)
@given(p=montos, i=montos, c=montos, pago=montos)
def test_imputaciones_nunca_negativas(p, i, c, pago):
    res = aplicar_pago(_saldo(p, i, c), EntradaPago(pago, date(2026, 1, 20)))
    assert all(imp.monto >= Decimal("0.00") for imp in res.imputaciones)
    assert res.excedente >= Decimal("0.00")


@settings(max_examples=200)
@given(p=montos, i=montos, c=montos, pago=montos)
def test_no_imputa_mas_que_lo_disponible_por_concepto(p, i, c, pago):
    res = aplicar_pago(_saldo(p, i, c), EntradaPago(pago, date(2026, 1, 20)))
    por_concepto = {}
    for imp in res.imputaciones:
        por_concepto[imp.concepto] = por_concepto.get(imp.concepto, Decimal("0")) + imp.monto
    from nexocred_core import ConceptoImputacion as K
    assert por_concepto.get(K.PUNITORIO_VENCIDO, Decimal("0")) <= p
    assert por_concepto.get(K.INTERES_VENCIDO, Decimal("0")) <= i
    assert por_concepto.get(K.CAPITAL_VENCIDO, Decimal("0")) <= c


@settings(max_examples=100)
@given(
    capital=montos_positivos,
    cuotas=st.integers(min_value=1, max_value=24),
)
def test_cronograma_es_deterministico_y_reconcilia(capital, cuotas):
    terminos = TerminosPrestamo(
        capital=capital,
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=cuotas,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
    )
    a = calcular_cronograma(terminos)
    b = calcular_cronograma(terminos)
    assert a == b  # determinismo
    assert a.total_capital == capital  # reconciliacion exacta


@settings(max_examples=100)
@given(capital=montos_positivos)
def test_saldo_exigible_no_negativo(capital):
    terminos = TerminosPrestamo(
        capital=capital,
        tasa_interes_directo=Decimal("0.10"),
        cantidad_cuotas=3,
        periodicidad=Periodicidad.MENSUAL,
        fecha_primera_cuota=date(2026, 1, 10),
        tasa_punitorio_diario=Decimal("0.001"),
    )
    saldo = calcular_saldo_exigible(calcular_cronograma(terminos), (), date(2026, 6, 10), Decimal("0.001"))
    for cuota in saldo.cuotas:
        assert cuota.punitorio >= Decimal("0.00")
        assert cuota.interes >= Decimal("0.00")
        assert cuota.capital >= Decimal("0.00")
    assert saldo.total_exigible >= Decimal("0.00")
```

- [ ] **Step 2: Run the property tests**

Run: `pytest backend/tests/core/test_propiedades.py -v`
Expected: PASS — all properties hold across generated examples.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/core/test_propiedades.py
git commit -m "test(core): propiedades Hypothesis de conservacion, determinismo y no-negatividad"
```

---

## Task 12: Purity / boundary guard (`test_pureza.py`)

Enforce spec §5.1 mechanically: the core must not import FastAPI, SQLAlchemy, Celery, Redis, DB drivers, settings, or read the system clock. This test fails loudly if a future change leaks an import.

**Files:**
- Test: `backend/tests/core/test_pureza.py`

- [ ] **Step 1: Write the purity test**

Create `backend/tests/core/test_pureza.py`:

```python
"""Guarda de frontera dura de spec 5.1: el core es puro, sin I/O ni reloj."""

import ast
import pathlib

CORE_DIR = pathlib.Path(__file__).resolve().parents[2] / "nexocred_core"

PROHIBIDOS = {
    "fastapi",
    "sqlalchemy",
    "celery",
    "redis",
    "psycopg",
    "psycopg2",
    "asyncpg",
    "pydantic",
    "pydantic_settings",
    "app",  # el paquete de backend con I/O
    "httpx",
    "requests",
    "os",
    "time",
}

# Llamadas de reloj prohibidas dentro del core.
RELOJ_PROHIBIDO = {"now", "today", "utcnow"}


def _modulos_core():
    return [p for p in CORE_DIR.glob("*.py")]


def test_core_no_importa_modulos_prohibidos():
    ofensas = []
    for archivo in _modulos_core():
        arbol = ast.parse(archivo.read_text(), filename=str(archivo))
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Import):
                for alias in nodo.names:
                    raiz = alias.name.split(".")[0]
                    if raiz in PROHIBIDOS:
                        ofensas.append(f"{archivo.name}: import {alias.name}")
            elif isinstance(nodo, ast.ImportFrom):
                raiz = (nodo.module or "").split(".")[0]
                if raiz in PROHIBIDOS:
                    ofensas.append(f"{archivo.name}: from {nodo.module} import ...")
    assert not ofensas, f"el core importa modulos prohibidos: {ofensas}"


def test_core_no_lee_reloj_del_sistema():
    ofensas = []
    for archivo in _modulos_core():
        arbol = ast.parse(archivo.read_text(), filename=str(archivo))
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Attribute) and nodo.attr in RELOJ_PROHIBIDO:
                ofensas.append(f"{archivo.name}: uso de .{nodo.attr}()")
    assert not ofensas, f"el core lee el reloj del sistema: {ofensas}"
```

- [ ] **Step 2: Run the purity test**

Run: `pytest backend/tests/core/test_pureza.py -v`
Expected: PASS — no prohibited imports, no clock reads. (`datetime` and `decimal` are allowed; only the listed roots are banned.)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/core/test_pureza.py
git commit -m "test(core): guarda de pureza de frontera (sin I/O, sin reloj)"
```

---

## Task 13: Full Pre-F1 gate

Run the full suite and quality gates together to confirm the stage acceptance criteria.

**Files:** none (verification only).

- [ ] **Step 1: Run the whole core suite**

Run: `pytest backend/tests/core -v`
Expected: PASS — every test green; the 8 `test_caso_N_*` present; property and purity tests pass.

- [ ] **Step 2: Run the entire repo test suite (no regressions)**

Run: `pytest -q`
Expected: PASS — core suite plus the existing `test_healthcheck` / `test_entorno`.

- [ ] **Step 3: Lint and typecheck the whole core**

Run: `ruff check backend/nexocred_core backend/tests/core && pyright backend/nexocred_core`
Expected: no errors.

- [ ] **Step 4: Confirm no `float` literal leaked into core or core tests**

Run: `grep -rnE '[0-9]+\.[0-9]+[^"'"'"'0-9]' backend/nexocred_core || echo "sin floats crudos en core"`
Expected: only `Decimal("...")`/string forms appear; no bare float literals in `nexocred_core/`. (Rate constants like `Decimal("0.001")` are strings, not floats — OK.)

- [ ] **Step 5: Commit (gate marker)**

```bash
git add -A
git commit -m "chore(core): Pre-F1 gate verde — nexocred_core cerrado" --allow-empty
```

---

## Acceptance Gate (maps to master-plan Stage 1)

- [ ] Core imports no FastAPI, SQLAlchemy, Celery, Redis, DB driver or settings module — enforced by `test_pureza.py`.
- [ ] Core reads no system clock; every date is an explicit `fecha_negocio` — enforced by `test_pureza.py`.
- [ ] Tests fail before implementation (Step 2/3 of each task) and pass after.
- [ ] No `float` in core financial code or tests except explicit negative tests asserting rejection (`test_dinero_rechaza_float`) — enforced by Task 13 Step 4.
- [ ] The 8 edge cases are represented as named tests (`test_caso_1_*` … `test_caso_8_*`) in `test_casos_borde.py`.
- [ ] `pytest backend/tests/core` and `pytest -q` are green.

---

## Self-Review against spec §5.1–§5.5

- **§5.1 purity / no clock / dates as params** → Tasks 1–8 take dates as params; Task 12 enforces mechanically. ✅
- **§5.1 included responsibilities** (money normalize, rounding, schedule, exigible balance, waterfall, tolerance, payoff, pure correction, simulator inputs) → Tasks 1,3,4,5,6,7,8 cover all except *simulator entries for M15/M02/M06*. **Scope note:** simulator-input value objects are thin wrappers over `TerminosPrestamo` + `calcular_cronograma`; they are deferred to F1a/F1b (Stage 2/3) where M15/M02/M06 consume the core, because they carry no new financial math. The math they need (`calcular_cronograma`, `calcular_payoff`) is closed here.
- **§5.1 excluded responsibilities** (persistence, audit, doc numbering, auth, BCRA, caja selection, notifications) → none implemented in core. ✅
- **§5.2 Decimal-only, ROUND_HALF_UP, reject float, reject negatives except reversals** → Task 1 (`dinero` rejects float; `permitir_negativo` opt-out); correction (Task 8) is the explicit negative-allowed path. ✅
- **§5.3 fecha_negocio everywhere** → every calculation takes `fecha_negocio`/dates explicitly. ✅
- **§5.4 waterfall exact order** → Task 5 implements steps 1–7; `total_imputado + excedente == monto` asserted (Task 5 + property Task 11). ✅
- **§5.5 eight edge cases as named tests** → Task 10. ✅

**Out of scope for Pre-F1 (carried forward):** simulator-input DTOs (Stage 2/3), step-4 "cargos/gastos exigibles" as a populated balance line (no data model for cargos yet in core — wired when M15 gastos exist; the waterfall slot is reserved but unfed). Both are noted so a later stage picks them up.
