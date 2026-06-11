# F1b — Originación, Préstamos, Caja, Pagos, Novaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `nexocred_core` into production backend workflows: M02 (solicitud lifecycle → scoring → simular → desembolso), M03 (préstamos, cronograma, pagos history, payoff), M04 (caja, ledger, arqueo, transferencias, pagos with waterfall + corrección 1 clic + tolerancia), M06 (novaciones), all transactional and idempotent.

**Architecture:** Each money-moving operation runs in one DB transaction with row locks (`SELECT ... FOR UPDATE`) on the affected prestamo/caja and an `Idempotency-Key` dedupe. The loan's frozen terms are stored as an immutable JSONB snapshot on `prestamo.snapshot_terminos`; the amortization schedule is materialized into `cuota` rows at disbursement. All financial math delegates to `nexocred_core` (`calcular_cronograma`, `calcular_saldo_exigible`, `aplicar_pago`, `calcular_payoff`, `corregir_pago`, `aplicar_tolerancia`) — the backend reconstructs core value objects from persisted rows, calls the core, and persists the results; it never re-derives interest/punitorio itself. Corrections are append-only contra-asientos; historical pagos/imputaciones are never mutated.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async (`with_for_update`), asyncpg, Alembic (migration `0002`), Pydantic v2, pytest, pytest-asyncio, httpx, `nexocred_core`. Run in the `nexocred` conda env; Postgres 18 via docker compose.

---

## Execution Environment (read first)

- Run everything via `conda run -n nexocred <cmd>`. Run pytest **from repo root**: `conda run -n nexocred python -m pytest -q`.
- Postgres up: `docker compose up -d db`. Tests use the `nexocred_test` DB built by `backend/tests/conftest.py` (Alembic `upgrade head`).
- Commit per task: `git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "..."`.
- Reuse existing infra: `app.deps` (`SessionDep`, `CurrentUser`, `AdminUser`, `AdminOAnalista`, `requiere_rol`), `app.errors.ErrorAPI`/`sobre_error`, `app.auditoria.escribir_evento`, `app.idempotencia.guardar_resultado_idempotente`, `app.m15_catalogo` `MontoStr`/`TasaStr` types and simulator service.
- Money: Decimal in Python, string(2dp) in JSON via `MontoStr`. Never float. Every financial endpoint takes/uses `fecha_negocio`.
- The F1a stub tables (`solicitud_credito`, `prestamo`, `cuota`, `pago`, `imputacion`, `movimiento_caja`) have minimal columns; migration `0002` extends them. Do not break F1a's 154 tests.

---

## Core reconstruction contract (used by Tasks 6,7,8,9)

A persisted loan reconstructs `nexocred_core.TerminosPrestamo` from `prestamo.snapshot_terminos` (JSONB), and prior `imputacion` rows reconstruct the `tuple[Imputacion, ...]` the core needs. Implement once in `backend/app/m03_prestamos/reconstruccion.py`:

```python
from datetime import date
from decimal import Decimal

from nexocred_core import (
    ConceptoImputacion, Imputacion, Periodicidad, TerminosPrestamo,
)


def terminos_desde_snapshot(snapshot: dict) -> TerminosPrestamo:
    return TerminosPrestamo(
        capital=Decimal(snapshot["capital"]),
        tasa_interes_directo=Decimal(snapshot["tasa_interes_directo"]),
        cantidad_cuotas=int(snapshot["cantidad_cuotas"]),
        periodicidad=Periodicidad(snapshot["periodicidad"]),
        fecha_primera_cuota=date.fromisoformat(snapshot["fecha_primera_cuota"]),
        tasa_punitorio_diario=Decimal(snapshot["tasa_punitorio_diario"]),
    )


def imputaciones_core(filas: list) -> tuple[Imputacion, ...]:
    # filas: ORM Imputacion rows (concepto str, monto Decimal, orden_waterfall int, cuota_numero int|None)
    return tuple(
        Imputacion(
            concepto=ConceptoImputacion(f.concepto),
            monto=f.monto,
            orden_waterfall=f.orden_waterfall,
            cuota_numero=f.cuota_numero,
        )
        for f in filas
    )
```

---

## File Structure

```
backend/app/
  locking.py                  # CREATE: bloquear_prestamo(session,id), bloquear_caja(session,id) -> with_for_update loaders
  m02_originacion/{modelos.py,schemas.py,servicio.py,router.py}
  m03_prestamos/{schemas.py,servicio.py,router.py,reconstruccion.py}
  m04_caja/{modelos.py,schemas.py,servicio.py,router.py}
  m04_pagos/{schemas.py,servicio.py,router.py}     # §7.1 motor de pagos
  m06_novaciones/{modelos.py,schemas.py,servicio.py,router.py}
  api.py                      # MODIFY: include new routers
backend/alembic/versions/0002_f1b.py   # CREATE: extend prestamo/cuota/pago/imputacion/solicitud + caja tables + novacion
backend/tests/
  integration/test_desembolso.py
  integration/test_pagos_waterfall.py
  integration/test_pagos_idempotencia.py
  integration/test_correccion.py
  integration/test_payoff_cancelacion.py
  integration/test_tolerancia.py
  integration/test_caja.py
  integration/test_novaciones.py
  api/test_solicitudes.py
  api/test_prestamos.py
```

---

## Task 1: Migration 0002 — extend financial tables

**Files:** Create `backend/alembic/versions/0002_f1b.py`; Test `backend/tests/db/test_migracion_0002.py`

- [ ] **Step 1: Write failing test for the new columns**

Create `backend/tests/db/test_migracion_0002.py`:

```python
from sqlalchemy import text


async def _cols(session, tabla):
    res = await session.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name=:t"
    ), {"t": tabla})
    return {r[0] for r in res}


async def test_prestamo_tiene_snapshot_y_terminos(session):
    cols = await _cols(session, "prestamo")
    for c in ["snapshot_terminos", "fecha_desembolso", "tasa_punitorio_diario", "vendedor_id"]:
        assert c in cols


async def test_pago_tiene_idempotency_y_canal(session):
    cols = await _cols(session, "pago")
    for c in ["idempotency_key", "canal", "corrige_pago_id"]:
        assert c in cols


async def test_imputacion_tiene_orden_waterfall_y_cuota_numero(session):
    cols = await _cols(session, "imputacion")
    for c in ["orden_waterfall", "cuota_numero"]:
        assert c in cols


async def test_cuota_tiene_estado_y_saldos(session):
    cols = await _cols(session, "cuota")
    for c in ["punitorio_acumulado", "estado"]:
        assert c in cols


async def test_tablas_caja_y_novacion_existen(session):
    from sqlalchemy import inspect as _i  # noqa
    res = await session.execute(text(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    ))
    tablas = {r[0] for r in res}
    for t in ["caja", "novacion"]:
        assert t in tablas
```

- [ ] **Step 2: Run, confirm fail.** `conda run -n nexocred python -m pytest backend/tests/db/test_migracion_0002.py -v` → FAIL (columns/tables absent).

- [ ] **Step 3: Author `0002_f1b.py`.** Add via `op.add_column`/`op.create_table`:
  - `prestamo`: `snapshot_terminos JSONB NOT NULL` (filled at disbursement; column added nullable then later writes enforce), `fecha_desembolso DATE`, `tasa_punitorio_diario NUMERIC(10,4) DEFAULT 0`, `vendedor_id UUID REFERENCES usuario(id)`, `monto_desembolsado NUMERIC(14,2)`. (Add `snapshot_terminos` as nullable to satisfy existing rows; service always writes it.)
  - `cuota`: `punitorio_acumulado NUMERIC(14,2) DEFAULT 0`, `cuota NUMERIC(14,2)`, ensure `estado` CHECK in `('pendiente','parcial','pagada','tolerada')`, `vencimiento NOT NULL` left as is.
  - `pago`: `idempotency_key VARCHAR(255)`, `canal TEXT`, `corrige_pago_id UUID REFERENCES pago(id)`, `excedente NUMERIC(14,2) DEFAULT 0`, `estado` CHECK `('registrado','aplicado','a_aplicar','corregido')`. Add `UNIQUE(idempotency_key)` partial where not null: `op.create_index('pago_idem_uq','pago',['idempotency_key'],unique=True,postgresql_where=sa.text('idempotency_key IS NOT NULL'))`.
  - `imputacion`: `orden_waterfall INT NOT NULL DEFAULT 0`, `cuota_numero INT`, keep `concepto`/`monto`.
  - `solicitud_credito`: `perfil_pricing_id UUID REFERENCES perfil_pricing(id)`, `tasa_resuelta NUMERIC(10,4)`, `score INT`, `motivo_rechazo TEXT`, `estado` CHECK `('borrador','en_analisis','aprobada','rechazada','desistida','desembolsada')`.
  - Create `caja` table: `id uuidv7 pk, nombre TEXT NOT NULL, tipo TEXT, saldo_teorico NUMERIC(14,2) DEFAULT 0, activo BOOL DEFAULT true, created_at`. Add FK `movimiento_caja.caja_id → caja.id`; extend `movimiento_caja` with `concepto TEXT, categoria TEXT, contraparte_caja_id UUID, pago_id UUID REFERENCES pago(id), referencia TEXT`.
  - Create `arqueo_caja`: `id, caja_id FK, fecha_negocio DATE, saldo_teorico NUMERIC(14,2), saldo_fisico NUMERIC(14,2), diferencia NUMERIC(14,2), cerrado_por UUID, created_at`.
  - Create `novacion`: `id, tipo TEXT CHECK ('refinanciacion','consolidacion','transferencia','repactar_rapido'), estado TEXT DEFAULT 'borrador' CHECK('borrador','confirmada','anulada'), nuevo_prestamo_id UUID REFERENCES prestamo(id), creado_por UUID, created_at`; and `novacion_origen`: `id, novacion_id FK, prestamo_id FK` (N origines para consolidación).

- [ ] **Step 4: Run, confirm green.** Same pytest command → PASS.

- [ ] **Step 5: Clean-DB upgrade check + no F1a regression.** `conda run -n nexocred python -m pytest backend/tests/db -q` → all green.

- [ ] **Step 6: Commit.** `feat(db): migracion 0002 extiende prestamo/pago/imputacion/cuota/caja/novacion`.

---

## Task 2: Row-lock helpers (`locking.py`)

**Files:** Create `backend/app/locking.py`; Test `backend/tests/integration/test_locking.py`

- [ ] **Step 1: Write failing test.** Lock a prestamo row inside a transaction, assert the loader returns the ORM object and uses `FOR UPDATE` (assert by inspecting compiled SQL contains `FOR UPDATE`).

```python
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.locking import _stmt_prestamo_for_update


def test_stmt_usa_for_update():
    stmt = _stmt_prestamo_for_update("00000000-0000-0000-0000-000000000000")
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql
```

- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `_stmt_prestamo_for_update(id)` returning `select(Prestamo).where(Prestamo.id==id).with_for_update()`, plus `async def bloquear_prestamo(session,id) -> Prestamo` (raises `ErrorAPI('prestamo_no_encontrado',404)` if None) and `bloquear_caja(session,id)`.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(backend): helpers de lock de fila (FOR UPDATE) para prestamo/caja`.

---

## Task 3: M02 — solicitud lifecycle + policy checklist

**Files:** `backend/app/m02_originacion/{schemas.py,servicio.py,router.py}`; Test `backend/tests/api/test_solicitudes.py`

- [ ] **Step 1: Write failing tests.** `POST /solicitudes` (persona_id, producto_id, monto) → 201 `borrador`; `PATCH /solicitudes/{id}/estado` valid transitions per §5.6 (`borrador→en_analisis→aprobada|rechazada|desistida`), invalid transition → 409 `transicion_invalida`; `GET /solicitudes/{id}/validar-politicas` returns a checklist with `edad`, `cuota_ingreso`, `bcra`, `mora_previa` booleans; **approval blocked when BCRA not synced within `bcra_vigencia_dias`** → attempting `estado=aprobada` returns 409 `bcra_vencido` until a sync exists. Seed persona+producto via existing services.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the state machine (validate transitions against an allowed-map, raise `ErrorAPI('transicion_invalida',409)`), `validar_politicas` (age from `persona.fecha_nac` vs param, cuota/ingreso ratio using a simulated cuota vs `ingresos_totales`, BCRA presence+vigencia, prior mora check), and the approval guard reading the latest `persona_deuda_bcra.fecha_informe` vs `configuracion.bcra_vigencia_dias`. Audit every transition (§5.8). RBAC: `AdminOAnalista` for evaluate/approve.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m02): ciclo de solicitud, checklist de politicas, bloqueo por BCRA vencido`.

---

## Task 4: M02 — scoring + perfil assignment + simular oferta

**Files:** `backend/app/m02_originacion/{servicio.py,router.py}`; Test extend `backend/tests/api/test_solicitudes.py`

- [ ] **Step 1: Write failing tests.** `POST /solicitudes/{id}/evaluar` computes an internal `score`, assigns a `perfil_pricing_id`, resolves `tasa_resuelta` from the matriz (producto×perfil×plazo) and moves to `en_analisis`; `POST /solicitudes/{id}/simular` returns an offer (cronograma) using `m15` simulator/`nexocred_core`, money as strings, reconciling with `calcular_cronograma`.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** a deterministic scoring function (documented heuristic over ingresos/BCRA situación/mora — pure, testable), perfil assignment by score bands, tasa resolution from `matriz_tasa`, and offer simulation delegating to the M15 simulator service. No float on money.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m02): scoring interno, asignacion de perfil y simulacion de oferta`.

---

## Task 5: M02 — desembolso (one transaction: loan + snapshot + schedule + caja)

**Files:** `backend/app/m02_originacion/servicio.py`, `backend/app/m03_prestamos/reconstruccion.py`; Test `backend/tests/integration/test_desembolso.py`

- [ ] **Step 1: Write failing tests.** `POST /solicitudes/{id}/desembolsar` (Idempotency-Key header, caja_id) on an `aprobada` solicitud: creates `prestamo` (`vigente`) with `snapshot_terminos` JSONB, materializes N `cuota` rows matching `calcular_cronograma`, creates a `movimiento_caja` ingreso/egreso for the disbursed amount, transitions solicitud→`desembolsada`; the snapshot reconstructs to the exact `TerminosPrestamo`. **Idempotency:** repeating the same Idempotency-Key returns the same prestamo, creates no second loan/cuotas/movimiento. Assert cuota count and that `terminos_desde_snapshot(prestamo.snapshot_terminos)` round-trips.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `desembolsar(session, solicitud_id, caja_id, idempotency_key, actor)`: dedupe via `guardar_resultado_idempotente`; in one transaction lock the caja, build `TerminosPrestamo`, call `calcular_cronograma`, write prestamo + snapshot (Decimal→str in JSON) + cuota rows + caja movement, flip solicitud state, audit. RBAC `AdminOAnalista`.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m02): desembolso transaccional con snapshot inmutable, cronograma materializado e idempotencia`.

---

## Task 6: M03 — préstamo detail, cuotas, pagos history, payoff

**Files:** `backend/app/m03_prestamos/{schemas.py,servicio.py,router.py}`; Test `backend/tests/api/test_prestamos.py`, `backend/tests/integration/test_payoff_cancelacion.py`

- [ ] **Step 1: Write failing tests.** `GET /prestamos` (filters), `GET /prestamos/{id}` (detail + snapshot), `GET /prestamos/{id}/cuotas` (schedule with saldos), `GET /prestamos/{id}/pagos` (history + imputaciones), `GET /prestamos/{id}/payoff?fecha_negocio=` returns the total from `calcular_payoff` reconstructed from snapshot+imputaciones, money strings. `POST /prestamos/{id}/cancelar` (Idempotency-Key) registers a cancelación-anticipada pago consuming payoff and moves prestamo→`cancelado`.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** read endpoints + payoff (reconstruct via `reconstruccion.py`, call `calcular_payoff`) + cancelar (delegates to the pago engine in Task 7 with `ModoPago.CANCELACION_ANTICIPADA`, then state transition). Money strings.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m03): detalle, cuotas, pagos, payoff y cancelacion de prestamo`.

---

## Task 7: M04 §7.1 — payment registration with waterfall, locks, idempotency

**Files:** `backend/app/m04_pagos/{schemas.py,servicio.py,router.py}`; Test `backend/tests/integration/test_pagos_waterfall.py`, `test_pagos_idempotencia.py`

- [ ] **Step 1: Write failing tests.** `POST /pagos` (prestamo_id, monto, canal, caja_id, fecha_negocio, Idempotency-Key): locks prestamo, computes `calcular_saldo_exigible` from snapshot+cuotas+prior imputaciones, calls `aplicar_pago`, persists `pago` + `imputacion` rows (with `orden_waterfall`, `cuota_numero`) + a `movimiento_caja` ingreso, updates affected `cuota.estado`/saldos. **Reconciliation:** sum(imputaciones)+excedente == pago.monto; caja movement == pago.monto. **Idempotency:** same Idempotency-Key returns the same pago, no double imputación, no second caja movement. `GET /pagos/{id}` shows desglosed imputaciones. `GET /pagos/a-aplicar` and `POST /pagos/{id}/aplicar` for offline queue.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `registrar_pago(...)`: idempotency dedupe; transaction + `bloquear_prestamo`; reconstruct saldo; `aplicar_pago`; persist; update cuota states (mark `pagada`/`parcial`); write caja movement linked to pago; audit (§5.8). Reject negative monto (core already does). Money strings in API.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m04): registro de pago con waterfall del core, locks e idempotencia`.

---

## Task 8: M04 — corrección 1 clic (contra-asiento + nuevo pago, append-only)

**Files:** `backend/app/m04_pagos/{servicio.py,router.py}`; Test `backend/tests/integration/test_correccion.py`

- [ ] **Step 1: Write failing tests.** `POST /pagos/{id}/corregir` (Idempotency-Key, nuevo monto/datos): reverses the original via `corregir_pago` (writes negative contra-asiento imputaciones + a reversing caja movement), marks original pago `corregido` (**never edits its rows**), applies a fresh replacement pago from scratch. Assert: original pago/imputaciones byte-for-byte unchanged; sum(original imputaciones)+sum(reversas)==0; new pago links `corrige_pago_id`; idempotent on repeat.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `corregir(...)`: load original (read-only), `corregir_pago(original_result, replacement_result)`, persist reversas + reversing caja movement + replacement pago, set original.estado=`corregido`, audit. Append-only guarantee enforced by never UPDATEing original imputacion rows.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m04): correccion 1 clic como contra-asiento + reemplazo, append-only`.

---

## Task 9: M04 — tolerancia de cobro

**Files:** `backend/app/m04_pagos/servicio.py`; Test `backend/tests/integration/test_tolerancia.py`

- [ ] **Step 1: Write failing tests.** A pago that falls short of an exigible cuota by ≤ the configured tolerance (`parametros.tolerancia_cobro`) closes the cuota as `tolerada` and records a tolerance adjustment via `aplicar_tolerancia`; a shortfall > tolerance leaves the cuota `parcial` with pending saldo.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** tolerance handling inside `registrar_pago` post-waterfall: when a targeted cuota's remaining exigible is within tolerance, call `aplicar_tolerancia`, mark cuota `tolerada`, persist the adjustment. Read tolerance from the parametros store.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m04): tolerancia de cobro cierra cuota con ajuste`.

---

## Task 10: M04 — cajas, ledger, manual movements, transfers, arqueo

**Files:** `backend/app/m04_caja/{modelos.py,schemas.py,servicio.py,router.py}`; Test `backend/tests/integration/test_caja.py`

- [ ] **Step 1: Write failing tests.** `GET/POST /cajas`; `GET /cajas/{id}/movimientos` (date filters, append-only ledger); `POST /cajas/{id}/movimientos` (categorized egreso/ingreso) updates `saldo_teorico`; `POST /transferencias-internas` (lock both cajas, two linked movements, sum zero); `GET /cajas/{id}/arqueo-pendiente` (teórico vs físico); `POST /cajas/{id}/arqueo` closes the day (append-only, no reopen). `GET /cajas/posicion-consolidada` sums all. Reconcile: ledger sum == saldo_teorico.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** caja CRUD, append-only ledger, manual movements (audit), transfer (two-caja lock + two movements), arqueo (compute diferencia, persist `arqueo_caja`, block reopen), consolidated position. Money strings.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m04): cajas, ledger, movimientos, transferencias y arqueo diario`.

---

## Task 11: M06 — novaciones (refinanciar, consolidar, transferir, repactar)

**Files:** `backend/app/m06_novaciones/{modelos.py,schemas.py,servicio.py,router.py}`; Test `backend/tests/integration/test_novaciones.py`

- [ ] **Step 1: Write failing tests.** Each endpoint (Idempotency-Key) creates a `novacion` (estado `confirmada`) and a new `prestamo`, closing/relating origin loan(s):
  - `POST /novaciones/refinanciar` (1→1): origin prestamo→`novado`, new loan with fresh snapshot+cuotas; payoff of origin becomes new capital (per condiciones).
  - `POST /novaciones/consolidar` (N→1): multiple `novacion_origen` rows, all origins→`novado`, one new loan.
  - `POST /novaciones/transferir` (1→1 nuevo deudor): new loan with `persona_id = nuevo_deudor_id`.
  - `POST /novaciones/repactar-rapido` (pago_cuenta, nueva_cuota, periodicidad).
  - `GET /novaciones/{id}` (origen + nuevo) and `GET /prestamos/{id}/novaciones` (chain). Assert traceable origin/new chains; idempotent.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** novation service: in one transaction lock origin loan(s), compute payoff via core, create new loan (reusing the desembolso machinery for snapshot+cuotas), write `novacion`+`novacion_origen`, transition origins→`novado`, audit. Idempotent + locked.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m06): novaciones refinanciar/consolidar/transferir/repactar con cadenas trazables`.

---

## Task 12: OpenAPI re-export + F1b full gate

**Files:** `docs/openapi/f1b.json`

- [ ] **Step 1: Re-export OpenAPI.** Run the existing `scripts/exportar_openapi.py` (writes `docs/openapi/f1b.json` for the F1b surface). Confirm it contains `/solicitudes/{id}/desembolsar`, `/pagos`, `/pagos/{id}/corregir`, `/prestamos/{id}/payoff`, `/novaciones/*`, `/cajas/*`.
- [ ] **Step 2: Full suite from repo root.** `docker compose up -d db && conda run -n nexocred python -m pytest -q` → all green (154 F1a + F1b, no regressions).
- [ ] **Step 3: Clean-DB migration check.** Drop scratch DB, `alembic upgrade head` through `0002` → success.
- [ ] **Step 4: Lint + typecheck.** `conda run -n nexocred ruff check backend/app backend/tests && conda run -n nexocred pyright backend/app` → clean.
- [ ] **Step 5: Reconciliation spot check.** A scripted end-to-end (persona→solicitud→aprobar→desembolsar→pagar→corregir) asserting money conservation at each step. Add as `backend/tests/integration/test_e2e_f1b.py`.
- [ ] **Step 6: Commit** `chore(backend): F1b gate verde + OpenAPI f1b`.

---

## Acceptance Gate (maps to master-plan Stage 3)

- [ ] Solicitud-to-disbursement works end to end (Task 5, Task 12 Step 5).
- [ ] Payment totals reconcile across payment, imputations and caja movement (Task 7).
- [ ] Duplicate payment/correction requests with the same idempotency key do not double-apply (Task 7, Task 8).
- [ ] Corrections never mutate historical payments (Task 8: original rows unchanged assertion).
- [ ] Novation creates traceable origin/new-loan chains (Task 11).
- [ ] Approval blocked when BCRA not synced within validity (Task 3).
- [ ] Every financial endpoint uses `fecha_negocio`; money serialized as strings (all tasks).

---

## Self-Review against spec §5.4–§5.9 and §3

- **§3 M02/M03/M04/M06 endpoints** → Tasks 3–11 cover every path in spec §3 for these modules. ✅
- **§5.4 waterfall** → delegated to core; persisted with `orden_waterfall` (Task 7). ✅
- **§5.5 case 6 payoff / case 7 correction / case 8 tolerance** → Tasks 6,8,9. ✅
- **§5.6 state machines** (solicitud/prestamo/cuota/pago/novacion) → Tasks 3,5,6,7,8,11 enforce transitions, invalid→409. ✅
- **§5.7 idempotency + locks** → `Idempotency-Key` on desembolsar/pagos/corregir/cancelar/novaciones + `with_for_update` (Tasks 2,5,7,8,11). ✅
- **§5.8 auditoría** → audit writes on disbursement, payment, correction, manual caja movement, transfer, arqueo, novación (Tasks 5,7,8,10,11). ✅
- **§5.9 BCRA blocks approval** → Task 3. ✅
- **Snapshot inmutable (M03)** → JSONB on prestamo, reconstructed via `reconstruccion.py`, never re-derived (decisión confirmada). ✅
- **Out of scope (later stages):** route/field collection (M05), CRM/risk/vendors (F1c), treasury/tower/workflows/documents (F1d). The `parada_id` FK on pago already exists; route population is F1c.
```
