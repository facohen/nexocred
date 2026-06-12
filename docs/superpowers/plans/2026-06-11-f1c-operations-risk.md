# F1c — Campo (La Ruta), CRM, Comercial, Riesgo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement daily operations around collection and follow-up: M05 (La Ruta — route generation, offline idempotent sync, visit capture, rendición/descargos), M08 (CRM 360 — tareas, incidentes, interacciones, asignaciones, timeline, prospectos), M09 (comisiones — devengo, clawback, liquidaciones paid via caja egreso), M07 (riesgo — PAR30/60/90, aging, concentración, cosechas, motor de alarmas that creates CRM tasks).

**Architecture:** Each module is a vertical slice (modelos/schemas/servicio/router/tests) over the F1a/F1b foundation. La Ruta's offline sync uses the **device-generated UUIDv7 as the primary key** of `parada_ruta`/`pago`, so a replayed batch is idempotent by upsert (existing id → no re-apply); offline payments are **applied at sync time** via the F1b `registrar_pago_uow` with `fecha_negocio` = visit date. Risk metrics are pure functions over persisted loan/cuota state (testable against seeded fixtures); the alarm engine writes `alerta` rows and, on assignment, creates `tarea` rows (spec: workflows/alerts generate internal CRM tasks, no WhatsApp). Commission liquidations settle through a caja egreso via the F1b caja service.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, asyncpg, Alembic (migration `0003`), Pydantic v2, pytest, pytest-asyncio, httpx. Run in the `nexocred` conda env; Postgres 18 via docker compose. Reuses `nexocred_core`, `app.deps`, `app.locking`, `app.idempotencia`, `app.auditoria`, `app.m04_pagos.servicio.registrar_pago_uow`, `app.m04_caja.servicio.registrar_movimiento`.

---

## Execution Environment (read first)

- Run everything via `conda run -n nexocred <cmd>`. pytest **from repo root**: `conda run -n nexocred python -m pytest -q`.
- Postgres up: `docker compose up -d db`. Tests use the `nexocred_test` DB built by `backend/tests/conftest.py`.
- Commit per task: `git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "..."`.
- Do NOT regress the 214 passing F1a/F1b tests.
- Money: Decimal in Python, string(2dp) in JSON (reuse `MontoStr`). Every financial-dated op uses `fecha_negocio`.
- Reuse the unit-of-work pattern: composite ops call `*_uow` cores (non-committing) and commit once at the service boundary; lock affected prestamo/caja with `app.locking`.
- Roles (Spanish): `admin`, `analista`, `cobrador`, `vendedor`, `operador`, `tesoreria`. Use `requiere_rol(...)`/`AdminUser`/etc. from `app.deps`.

---

## File Structure

```
backend/app/
  m05_ruta/{schemas.py,servicio.py,sync.py,router.py}     # rutas, paradas, visitar, sync offline, rendiciones, descargos
  m08_crm/{modelos.py,schemas.py,servicio.py,router.py}   # tareas, incidentes, interacciones, asignaciones, timeline, prospectos
  m09_comisiones/{schemas.py,servicio.py,router.py}       # devengo, clawback, liquidaciones, portal vendedor
  m07_riesgo/{metricas.py,schemas.py,servicio.py,router.py,alarmas.py}  # PAR/aging/concentracion/cosechas + motor de alarmas
  api.py   # MODIFY: include new routers
backend/alembic/versions/0003_f1c.py   # extend ruta_diaria/parada_ruta + rendicion/descargo + comision/liquidacion + crm + prospecto + interaccion + alerta deltas
backend/tests/
  services/test_metricas_riesgo.py
  integration/test_ruta_generacion.py
  integration/test_ruta_sync_idempotente.py
  integration/test_rendicion.py
  integration/test_comisiones.py
  integration/test_alarmas.py
  api/test_crm.py
  api/test_prospectos.py
  api/test_riesgo.py
```

---

## Task 1: Migration 0003 — F1c tables and deltas

**Files:** Create `backend/alembic/versions/0003_f1c.py`; Test `backend/tests/db/test_migracion_0003.py`

- [ ] **Step 1: Write failing test for the new columns/tables**

Create `backend/tests/db/test_migracion_0003.py`:

```python
from sqlalchemy import text


async def _tablas(session):
    res = await session.execute(text(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    ))
    return {r[0] for r in res}


async def _cols(session, t):
    res = await session.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name=:t"), {"t": t})
    return {r[0] for r in res}


async def test_tablas_f1c_existen(session):
    tablas = await _tablas(session)
    for t in ["rendicion", "rendicion_descargo", "comision_liquidacion",
              "comision_liquidacion_detalle", "interaccion", "asignacion_crm", "prospecto"]:
        assert t in tablas, t


async def test_parada_ruta_tiene_sync_fields(session):
    cols = await _cols(session, "parada_ruta")
    assert "ruta_id" in cols and "resultado" in cols  # already from F1a


async def test_comision_devengo_tiene_clawback(session):
    cols = await _cols(session, "comision_devengo")
    for c in ["tipo", "porcentaje", "clawback_de_id"]:
        assert c in cols


async def test_alerta_tiene_severidad_y_asignacion(session):
    cols = await _cols(session, "alerta")
    for c in ["severidad", "operador_id", "tarea_id", "metrica"]:
        assert c in cols
```

- [ ] **Step 2: Run, confirm fail.** `conda run -n nexocred python -m pytest backend/tests/db/test_migracion_0003.py -v` → FAIL.

- [ ] **Step 3: Author `0003_f1c.py`.** Via `op.add_column`/`op.create_table`:
  - `rendicion`: `id uuidv7 pk, ruta_id UUID REFERENCES ruta_diaria(id), cobrador_id UUID REFERENCES usuario(id), fecha_negocio DATE NOT NULL, total_cobrado NUMERIC(14,2) DEFAULT 0, total_descargos NUMERIC(14,2) DEFAULT 0, diferencia NUMERIC(14,2) DEFAULT 0, estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','presentada','aprobada','observada')), created_at`.
  - `rendicion_descargo`: `id, rendicion_id FK, concepto TEXT NOT NULL, monto NUMERIC(14,2) NOT NULL, estado TEXT DEFAULT 'pendiente' CHECK ('pendiente','aprobado','rechazado'), aprobado_por UUID, created_at`.
  - `comision_devengo` deltas: `tipo TEXT`, `porcentaje NUMERIC(10,4)`, `clawback_de_id UUID REFERENCES comision_devengo(id)`, ensure `estado` CHECK `('devengada','confirmada','clawback','liquidada')`.
  - `comision_liquidacion` + `comision_liquidacion_detalle` per spec §2 (`liquidacion_comision`/`liquidacion_detalle` shape: vendedor_id, periodo_desde/hasta, monto_total, estado borrador/aprobada/pagada, aprobada_por/en, egreso_id REFERENCES movimiento_caja(id); detalle: liquidacion_id FK, comision_devengo_id FK, monto). Name them `comision_liquidacion`/`comision_liquidacion_detalle` for module-name consistency.
  - `interaccion`: `id, persona_id FK, operador_id UUID, tipo TEXT CHECK ('llamada','visita','mensaje','nota'), tarea_id UUID, detalle TEXT, fecha TIMESTAMPTZ DEFAULT now(), created_at`.
  - `asignacion_crm`: `id, persona_id FK, operador_id UUID REFERENCES usuario(id), activo BOOL DEFAULT true, created_at`.
  - `prospecto`: `id, nombre TEXT, telefono TEXT, estado TEXT DEFAULT 'nuevo' CHECK ('nuevo','contactado','calificado','convertido','descartado'), persona_id UUID REFERENCES persona(id), operador_id UUID, created_at`.
  - `tarea` deltas: `origen TEXT` (e.g. 'manual','alerta','workflow'), `alerta_id UUID`, `vencimiento DATE`, `prioridad TEXT`.
  - `incidente` deltas: `titulo TEXT`, `severidad TEXT`, `operador_id UUID`.
  - `alerta` deltas: `severidad TEXT`, `metrica TEXT`, `operador_id UUID REFERENCES usuario(id)`, `tarea_id UUID REFERENCES tarea(id)`, `resuelta_en TIMESTAMPTZ`, `justificacion TEXT`.

- [ ] **Step 4: Run, confirm green.** Same command → PASS.
- [ ] **Step 5: No-regression + clean-DB upgrade.** `conda run -n nexocred python -m pytest backend/tests/db -q` → green.
- [ ] **Step 6: Commit.** `feat(db): migracion 0003 — ruta/rendicion/comision/crm/prospecto/alerta deltas`.

---

## Task 2: M05 — route generation + stops

**Files:** `backend/app/m05_ruta/{schemas.py,servicio.py,router.py}`; Test `backend/tests/integration/test_ruta_generacion.py`

- [ ] **Step 1: Write failing tests.** `POST /rutas` (cobrador_id, fecha) generates a `ruta_diaria` with `parada_ruta` rows for loans with exigible balance on that date (ordered by `orden`); `GET /rutas` (day + estado filters); `GET /rutas/{id}` (detail with ordered stops); `GET /rutas/{id}/paradas` returns each stop with its `saldo_exigible` computed via `nexocred_core.calcular_saldo_exigible` (money strings). Seed 2 loans (one with overdue cuota, one not yet due) → only the exigible one becomes a stop.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** route generation (select loans `vigente`/`en_mora` with exigible amount on `fecha`, create stops), read endpoints, and per-stop saldo via the F1b reconstruction + core. RBAC: `admin`/`cobrador`. Audit route creation.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m05): generacion de ruta y paradas con saldo exigible del core`.

---

## Task 3: M05 — visit capture

**Files:** `backend/app/m05_ruta/{servicio.py,router.py}`; Test extend `backend/tests/integration/test_ruta_generacion.py`

- [ ] **Step 1: Write failing tests.** `POST /rutas/{id}/paradas/{parada_id}/visitar` with `{resultado, monto_cobrado, foto_url, lat, lng, notas}`: sets `parada_ruta.resultado/monto_cobrado/foto/lat/lng/notas/visitada_en`; when `resultado in ('pago','parcial')` and `monto_cobrado>0`, registers a pago via `registrar_pago_uow` (fecha_negocio = visit date, canal='ruta', parada_id linked) inside one transaction (commit once); `resultado='promesa'/'ausente'/'se_niega'` records the outcome without a pago. Money strings.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `visitar(...)`: lock prestamo, update stop, optionally `registrar_pago_uow` then single commit; reject invalid `resultado` (CHECK / 422). Audit.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m05): registro de visita con resultado, monto, foto y geotag`.

---

## Task 4: M05 — offline idempotent sync (device UUIDv7 = PK, apply at sync)

**Files:** `backend/app/m05_ruta/sync.py`, `backend/app/m05_ruta/router.py`; Test `backend/tests/integration/test_ruta_sync_idempotente.py`

- [ ] **Step 1: Write failing tests.** `POST /rutas/{id}/sync` with a batch:

```python
batch = {"paradas": [
    {"id": "<device-uuidv7>", "prestamo_id": "...", "orden": 1,
     "resultado": "pago", "monto_cobrado": "2200.00",
     "lat": "-34.6037", "lng": "-58.3816", "visitada_en": "2026-01-10T12:00:00Z",
     "pago_id": "<device-uuidv7>"}
]}
```

Asserts: first sync creates the parada (with the device id as PK) and applies the pago (waterfall) once; **re-POSTing the identical batch creates NO duplicate parada/pago/imputacion/caja-movement** (upsert by device PK is the dedupe); a batch with a new parada adds only the new one; reconciliation holds (sum imputaciones+excedente == pago.monto).

- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `sincronizar(session, ruta_id, batch, actor)`: for each parada, `INSERT ... ON CONFLICT (id) DO NOTHING` (device UUIDv7 PK); if newly inserted and it carries a payment, call `registrar_pago_uow` using the device `pago_id` as the pago PK (so the pago is also idempotent by PK); single commit at the end; audit a sync summary. Lock each affected prestamo. Return per-item applied/skipped status.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m05): sync offline idempotente por UUIDv7 de dispositivo, aplica pagos en el sync`.

---

## Task 5: M05 — rendiciones + descargos

**Files:** `backend/app/m05_ruta/{servicio.py,router.py}`; Test `backend/tests/integration/test_rendicion.py`

- [ ] **Step 1: Write failing tests.** `POST /rendiciones` (ruta_id, fecha) computes `total_cobrado` from the route's pagos, opens a `rendicion`; `POST /rendiciones/{id}/descargos` adds a field expense; `PATCH /rendiciones/{id}/descargos/{desc_id}` approves/rejects (admin); `GET /rendiciones/{id}` shows `diferencia = total_cobrado - sum(approved descargos)`; state machine `abierta→presentada→aprobada|observada` (§5.6), invalid→409. Reconcile: rendición totals == route collections − approved descargos.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** rendición lifecycle, descargo add/approve, difference computation, audit. RBAC: cobrador opens/presents, admin approves.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m05): rendiciones con descargos, diferencia y aprobacion`.

---

## Task 6: M08 — tareas + interacciones

**Files:** `backend/app/m08_crm/{modelos.py,schemas.py,servicio.py,router.py}`; Test `backend/tests/api/test_crm.py`

- [ ] **Step 1: Write failing tests.** `GET /tareas` (operator inbox / all for admin), `POST /tareas`, `GET/PATCH /tareas/{id}` (estado/reassign), `POST /tareas/{id}/completar` (records an `interaccion`), `POST /interacciones`, `GET /personas/{id}/tareas`. Operator only sees own tasks unless admin.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** tarea CRUD + completar (creates interaccion), interaccion create, scoping by operador. Audit task assignment changes.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m08): tareas, completar con interaccion y bandeja por operador`.

---

## Task 7: M08 — incidentes + asignaciones + timeline + prospectos

**Files:** `backend/app/m08_crm/{servicio.py,router.py}`; Test `backend/tests/api/test_crm.py`, `backend/tests/api/test_prospectos.py`

- [ ] **Step 1: Write failing tests.** `GET/POST /incidentes`, `GET/PATCH /incidentes/{id}`; `POST /crm/asignaciones`, `POST /crm/asignaciones/masivo` (admin); `GET /personas/{id}/timeline` aggregates interacciones + incidentes + credit events (solicitud/desembolso/pago) in time order; `GET/POST /prospectos`, `PATCH /prospectos/{id}` (advance estado / `convertido` promotes to persona). Timeline assertion: a persona with a pago and an interaccion returns both, ordered.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** incidentes CRUD, asignación (single + masivo), timeline aggregation query (union of CRM + credit events for the persona), prospecto pipeline with promote-to-persona. Audit assignments and promotion.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m08): incidentes, asignaciones, timeline 360 y prospectos`.

---

## Task 8: M09 — commission accrual + clawback

**Files:** `backend/app/m09_comisiones/{schemas.py,servicio.py,router.py}`; Test `backend/tests/integration/test_comisiones.py`

- [ ] **Step 1: Write failing tests.** On `desembolsar` a comision_devengo is accrued for the loan's `vendedor_id` using the producto×perfil commission matriz (estado `devengada`); `GET /vendedores/{id}/comisiones` lists devengadas/confirmadas/clawbacks/liquidadas; `GET /comisiones/devengo/{prestamo_id}`; a clawback (e.g. early cancellation within N days) creates a negative `comision_devengo` with `clawback_de_id` (estado `clawback`); `GET /vendedores/{id}/cartera` and `/pipeline`. Money strings.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** accrual hook at disbursement (resolve commission from matriz; do NOT recompute money via float), clawback creation, vendor portal read endpoints. Wire the accrual into the existing `desembolsar` flow (call from m09 servicio; keep desembolso atomic). Audit.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m09): devengo de comision en desembolso y clawback`.

---

## Task 9: M09 — liquidaciones paid via caja egreso

**Files:** `backend/app/m09_comisiones/{servicio.py,router.py}`; Test `backend/tests/integration/test_comisiones.py`

- [ ] **Step 1: Write failing tests.** `POST /comisiones/liquidaciones` (vendedor, periodo) sums confirmable devengos into a `comision_liquidacion` (borrador) with `comision_liquidacion_detalle` rows; `PATCH /comisiones/liquidaciones/{id}/aprobar` (admin) → aprobada; `POST /comisiones/liquidaciones/{id}/pagar` (Idempotency-Key) creates a caja **egreso** via `registrar_movimiento`, links `egreso_id`, marks liquidacion `pagada` and its devengos `liquidada` — all in one transaction. `GET /comisiones/liquidaciones`. Reconcile: liquidacion.monto_total == caja egreso amount == sum(detalle.monto). Idempotent pay.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** liquidación generation, approval, atomic pay-through-caja (lock caja, single commit, idempotent), state transitions. Audit liquidación approval and payment.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m09): liquidaciones de comision pagadas por egreso de caja, idempotente`.

---

## Task 10: M07 — risk metrics (pure)

**Files:** `backend/app/m07_riesgo/metricas.py`; Test `backend/tests/services/test_metricas_riesgo.py`

- [ ] **Step 1: Write failing tests.** Pure functions over a list of loan/cuota snapshots: `par(prestamos, dias)` returns the PAR ratio (overdue principal > `dias` / total outstanding) for 30/60/90; `aging(prestamos, fecha)` buckets outstanding by days overdue; `concentracion(prestamos, clave)` (by cliente/zona/vendedor/producto) returns shares; `cosechas(prestamos)` groups by origination month with cumulative overdue curve. Assert exact ratios on a small hand-built fixture (e.g. 100k cartera, 10k overdue >30 → PAR30 = 0.10). Decimal only.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the metric functions as pure Decimal computations (no DB, no float). Inputs are plain dataclasses/dicts the service layer builds from queries.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m07): metricas de riesgo puras PAR/aging/concentracion/cosechas`.

---

## Task 11: M07 — risk endpoints + alarm engine (creates CRM tasks)

**Files:** `backend/app/m07_riesgo/{schemas.py,servicio.py,router.py,alarmas.py}`; Test `backend/tests/api/test_riesgo.py`, `backend/tests/integration/test_alarmas.py`

- [ ] **Step 1: Write failing tests.** `GET /riesgo/tablero` (PAR30/60/90, aging, % refinanciado, pérdida esperada from seeded fixtures — matches the pure metrics), `GET /riesgo/cosechas`, `GET /riesgo/concentracion`; `GET /alertas`, `GET /alertas/{id}`, `PATCH /alertas/{id}/resolver` (justificación), `PATCH /alertas/{id}/asignar` (**creates a `tarea`** for the operador, sets `alerta.operador_id`/`tarea_id`), `POST /alertas/procesar` (admin) runs the engine: scans loans, creates `alerta` rows for threshold breaches (e.g. mora > X días) idempotently (no duplicate active alert for the same loan+metrica). Assert: assigning an alert creates exactly one CRM task linked back.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** risk read endpoints (build inputs from queries, call `metricas.py`), alarm engine in `alarmas.py` (idempotent alert creation keyed by loan+metrica+active), resolve/assign (assign creates tarea via m08 servicio). Audit alert resolution/assignment (§5.8).
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(m07): tablero de riesgo, motor de alarmas y asignacion que crea tarea CRM`.

---

## Task 12: OpenAPI re-export + F1c full gate

**Files:** `docs/openapi/f1c.json`

- [ ] **Step 1: Re-export OpenAPI** (`scripts/exportar_openapi_f1c.py` mirroring the f1b exporter). Confirm it contains `/rutas/*`, `/rendiciones/*`, `/tareas/*`, `/incidentes/*`, `/prospectos`, `/comisiones/*`, `/vendedores/{id}/*`, `/riesgo/*`, `/alertas/*`.
- [ ] **Step 2: Full suite from repo root.** `docker compose up -d db && conda run -n nexocred python -m pytest -q` → all green (214 + F1c, no regressions).
- [ ] **Step 3: Clean-DB migration check** through `0003`.
- [ ] **Step 4: Lint + typecheck.** `conda run -n nexocred ruff check backend/app backend/tests && conda run -n nexocred pyright backend/app` → clean.
- [ ] **Step 5: Reconciliation spot checks** — add `backend/tests/integration/test_e2e_f1c.py`: route→visit→sync→rendición reconciles collections; commission liquidation reconciles with caja egreso; alert assignment creates a task.
- [ ] **Step 6: Commit** `chore(backend): F1c gate verde + OpenAPI f1c`.

---

## Acceptance Gate (maps to master-plan Stage 4)

- [ ] Offline route sync can be retried without duplicate payments or duplicate stops (Task 4).
- [ ] Rendición totals reconcile route collections, descargos and differences (Task 5, Task 12 Step 5).
- [ ] Timeline aggregates CRM and credit events for a persona (Task 7).
- [ ] Commission liquidations reconcile with caja egreso (Task 9).
- [ ] Risk metrics match seeded portfolio fixtures (Task 10, Task 11).
- [ ] Alert assignment creates CRM tasks (Task 11).

---

## Self-Review against spec §3, §5

- **§3 M05/M08/M09/M07 endpoints** → Tasks 2–11 cover every path for these modules. ✅
- **§5.7 idempotency (route sync)** → device-UUIDv7 PK upsert + payment-by-PK (Task 4); liquidación pay Idempotency-Key (Task 9). ✅
- **§5.3 fecha_negocio** → visit/sync payments use visit date; rendición uses route date (Tasks 3,4,5). ✅
- **§5.2 money Decimal/string** → all money endpoints; risk metrics pure Decimal (Task 10). ✅
- **§5.8 auditoría** → route creation, visit, sync, rendición, liquidación approval/payment, alert resolution/assignment. ✅
- **Sin WhatsApp; alerts/workflows generate internal CRM tasks** → alarm assignment creates `tarea` (Task 11). ✅
- **Snapshot/core reuse** → route stop saldo and offline payments reuse F1b reconstruction + `registrar_pago_uow`; no recomputed interest. ✅
- **Out of scope (F1d):** treasury, La Torre, automated workflow engine (§7.2), document generation. `snapshot_cartera` metrics surface in F1d (M11); F1c computes live risk metrics on demand.
```
