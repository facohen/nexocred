# NexoCred POC Incremental Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete NexoCred POC from the repaired design spec through small, gated, testable implementation stages.

**Architecture:** The financial core is built first as a pure Python package with deterministic Decimal logic. The backend then wraps it with FastAPI, SQLAlchemy, Alembic, Celery and PostgreSQL. The frontend is delivered in waves against versioned OpenAPI contracts, with La Ruta treated as a dedicated offline PWA subsystem.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, Celery, Redis, PostgreSQL 18 or PostgreSQL 16/17 plus `pg_uuidv7`, React 18, Vite, TypeScript, Tailwind, shadcn/ui, TanStack Query/Router/Table, React Hook Form, Zod, Workbox, IndexedDB.

---

## Repository State (verified 2026-06-11)

This block records the actual workspace state so later stages do not redo Stage 0's reality check.

- The repo is **not** empty-except-docs. A Stage 0 monorepo skeleton already exists and `pytest` is green.
- Present: `pyproject.toml`, `environment.yml`, `backend/` (`app/main.py`, `app/config.py`, `nexocred_core/` empty package with `__init__.py`+`py.typed`, `tests/api/test_healthcheck.py`, `tests/test_entorno.py`, `Dockerfile`, `alembic/.gitkeep`), `frontend/` (placeholder), `infra/`, `docker-compose.yml` (`api`,`db`,`redis`), `.env.example`, `.gitignore`, `README.md`.
- **`backend/nexocred_core/money.py` does NOT exist.** The master-plan references to "inspect/preserve `money.py`" have no target — there is no pre-existing core to preserve. Stage 1 builds the core from scratch.
- **Stage 0 is complete.** Its acceptance gate is met; do not re-run the empty-repo/inventory-preservation steps.

## Execution Rule

Do not implement this POC directly from the master plan. Use this file as the sequence controller and create one detailed child plan per stage before coding that stage.

Seven of the eight child plans referenced below do not exist yet (only the Stage 0 plan and this master plan exist). Each must be written immediately before coding its stage, per spec §7.

Each child plan must include:

- exact files to create or modify;
- TDD steps with failing tests first;
- commands to run and expected results;
- explicit acceptance criteria;
- a short self-review against `docs/superpowers/specs/2026-06-11-nexocred-poc-design.md`.
- language convention check: plans/docs may be in English; product/business concepts use Spanish across code, database objects, API/domain payloads, UI copy, roles, permissions, seeds and functional error messages. Common technical English is allowed when it is the natural ecosystem/team term, such as `test`, `backend`, `frontend`, `endpoint`, `payload`, `healthcheck`, `seed`, `mock`, `fixture`, `snapshot`, `worker`, `job`, `retry`, `lock` and `deploy`.

## Stage 0: Repository Reality Check and Foundation

**Purpose:** Resolve the current workspace mismatch and establish the project skeleton without duplicating existing code.

**Child plan:** `docs/superpowers/plans/2026-06-11-stage-0-entorno-estructura.md`

**Files:**

- Inspect before writing: `PRD_NexoCred_v1.0.md`, `backend/nexocred_core/money.py`, `docs/superpowers/specs/2026-06-11-nexocred-poc-design.md`
- Create only if missing: `pyproject.toml`, `backend/`, `frontend/`, `docker-compose.yml`, `.env.example`, `README.md`

- [ ] Confirm whether the visible workspace contains only `docs/` or whether the IDE-open files live outside the sandbox.
- [ ] If existing backend files are present, inventory package layout and preserve existing code.
- [ ] If the repo is genuinely empty except docs, create a monorepo skeleton.
- [ ] Add backend test/lint/typecheck commands.
- [ ] Add frontend build/typecheck commands.
- [ ] Add Docker Compose services for `api`, `db` and `redis`; `api` serves only `/healthcheck` in Stage 0.
- [ ] Add a README with local setup and stage execution order.

**Acceptance Gate:**

- `pytest` runs, even if only smoke tests exist.
- Frontend build/typecheck command exists or is explicitly deferred until frontend scaffold.
- Docker Compose config validates and `api`, `db` and `redis` can run locally.
- No existing file from the IDE context is overwritten.

## Stage 1: Pre-F1 Financial Core

**Purpose:** Close `nexocred_core` before any endpoint or UI depends on it.

**Child plan:** `docs/superpowers/plans/2026-06-11-pre-f1-nexocred-core.md`

**Files:**

- Create/modify under `backend/nexocred_core/`
- Test under `backend/tests/core/` or `tests/core/`, matching the repository's chosen layout

- [ ] Define core value objects for money, dates, loan terms, schedule rows, payment inputs, imputations, payoff results and correction results.
- [ ] Implement Decimal-only money normalization and `ROUND_HALF_UP` rounding.
- [ ] Implement direct-interest schedule generation.
- [ ] Implement balance and due amount calculation by `fecha_negocio`.
- [ ] Implement waterfall in the exact order defined in the repaired spec.
- [ ] Implement payoff calculation for total cancellation.
- [ ] Implement tolerance calculation and adjustment output.
- [ ] Implement pure correction results as reversal plus replacement, with no persistence concerns.
- [ ] Add golden tests for the 8 minimum §7.1 cases in the repaired spec.
- [ ] Add Hypothesis properties for conservation of money, deterministic output and non-negative balances.

**Acceptance Gate:**

- Core imports no FastAPI, SQLAlchemy, Celery, Redis, database driver or settings module.
- Core reads no system clock (no `datetime.now()`/`date.today()`); every date is passed in explicitly as `fecha_negocio` per spec §5.1/§5.3.
- Tests fail before implementation in the child plan and pass after.
- No floats appear in core financial code or tests except in explicit negative tests that assert rejection.
- The 8 edge cases are represented as named tests.

## Stage 2: F1a Backend Base, Schema, M12 Minimum, M15, M01

**Purpose:** Build the persistent backend foundation and the first usable APIs.

**Child plan:** `docs/superpowers/plans/2026-06-11-f1a-backend-base-m01-m15.md`

**Files:**

- Backend app under `backend/app/`
- Migrations under `backend/alembic/`
- Tests under `backend/tests/api/`, `backend/tests/db/`, and `backend/tests/services/`

- [ ] Produce a schema inventory from PRD plus repaired spec; if PRD is unavailable, create the minimum inferred schema and document it in the migration.
- [ ] Add FastAPI app factory, settings, async DB session, healthcheck and `/api/v1` routing.
- [ ] Add Alembic initial migration with base tables plus repaired-spec deltas, including the spec §4 index types: BRIN on `created_at` for ledger tables (`pago`, `imputacion`, `movimiento_caja`, `comision_devengo`) and GIN on persona name search.
- [ ] Add the idempotency-key store (table + dedup helper) now, so Stage 3 financial operations and Stage 4 offline sync can reuse it without a separate migration. Cover both `Idempotency-Key` (header) and device-generated UUIDv7 keys per spec §5.7.
- [ ] Add M12 minimum: users, password hashing, JWT login/refresh/logout, RBAC dependency and audit event writer.
- [ ] Add M15 catalog: products, product versions, expenses, pricing profiles, rate matrices, commission matrices and simulators using `nexocred_core`.
- [ ] Add M01 personas: required ficha, CUIL module 11 validation, references, search, marks and BCRA history.
- [ ] Add BCRA port with fake/dev adapter and persistence of normalized results. Expose both endpoint surfaces from spec §3: M01 `POST /personas/{id}/deuda-bcra/sync` + `GET /personas/{id}/deuda-bcra`, and the standalone `POST /bcra/consultar/{persona_id}` + `GET /bcra/{persona_id}/historial`.
- [ ] Generate or expose OpenAPI for implemented endpoints.

**Acceptance Gate:**

- Alembic upgrades a clean database.
- Auth/RBAC blocks unauthorized access.
- Persona creation rejects invalid/missing required fields and duplicate CUIL.
- Solicitud approval is not implemented yet, but the BCRA data needed to block it later is persisted.
- Simulators return money as strings with two decimals.

## Stage 3: F1b Originacion, Prestamos, Caja, Pagos, Novaciones

**Purpose:** Bring the financial core into production backend workflows.

**Child plan:** `docs/superpowers/plans/2026-06-11-f1b-financial-operations.md`

**Files:**

- Backend modules for M02, M03, M04 and M06
- Financial integration tests under `backend/tests/integration/`

- [ ] Implement solicitud lifecycle and policy checklist.
- [ ] Block approval when BCRA was not synced within configured validity.
- [ ] Implement scoring/profile assignment and offer simulation through M15/core.
- [ ] Implement disbursement as one transaction that creates loan, immutable snapshot, schedule and caja movement.
- [ ] Implement loan detail, schedule, payments history and payoff endpoints.
- [ ] Implement payment registration with `Idempotency-Key`, row locks and core waterfall output.
- [ ] Implement correction 1 clic as contra-asiento plus replacement payment.
- [ ] Implement cash boxes, ledger, manual movements, transfers and daily arqueo.
- [ ] Implement novation flows: refinancing, consolidation, debtor transfer and quick renegotiation.

**Acceptance Gate:**

- Solicitud-to-disbursement works end to end.
- Payment totals reconcile across payment, imputations and caja movement.
- Duplicate payment/correction requests with the same idempotency key do not double-apply.
- Corrections never mutate historical payments.
- Novation creates traceable origin/new-loan chains.

## Stage 4: F1c Field, CRM, Commercial, Risk

**Purpose:** Implement daily operations around collection, customer follow-up, vendors and risk.

**Child plan:** `docs/superpowers/plans/2026-06-11-f1c-operations-risk.md`

**Files:**

- Backend modules for M05, M07, M08 and M09
- Job tests and integration tests for route/risk/commission flows

- [ ] Implement route generation and route stop APIs.
- [ ] Implement idempotent offline route sync using device-generated UUIDv7.
- [ ] Implement visit outcomes, collected amount, photo metadata and geotag metadata.
- [ ] Implement rendiciones and descargos with approval/rejection.
- [ ] Implement CRM tasks, incidents, interactions, assignments, timeline and prospects.
- [ ] Implement vendor commissions, clawbacks, liquidations and payment through caja egreso.
- [ ] Implement PAR30/60/90, aging, concentration, cosechas and alert processing.
- [ ] Ensure alert assignment creates CRM tasks.

**Acceptance Gate:**

- Offline route sync can be retried without duplicate payments or duplicate stops.
- Rendicion totals reconcile route collections, descargos and differences.
- Timeline aggregates CRM and credit events for a persona.
- Commission liquidations reconcile with caja egreso.
- Risk metrics match seeded portfolio fixtures.

## Stage 5: F1d Treasury, La Torre, Workflows, Documents

**Purpose:** Finish executive visibility, automation and document generation.

**Child plan:** `docs/superpowers/plans/2026-06-11-f1d-analytics-automation-documents.md`

**Files:**

- Backend modules for M10, M11, M13 and workflows
- Celery tasks and tests under backend job test layout

- [ ] Add the `worker` and `beat` Docker Compose services (Celery + Redis) required by spec §4; this is where Celery first runs. Defer the `web` (nginx) service to Stage 6/8 when the frontend build exists.
- [ ] Implement treasury position, cashflow, DCF, capital rotation, aportes and retiros.
- [ ] Implement snapshot generation job and admin/on-demand trigger.
- [ ] Implement La Torre endpoints from real persisted snapshots and live alert/task data.
- [ ] Implement workflow rules and executions for cobranza, novacion and CRM families.
- [ ] Ensure workflows create internal tasks, incidents, alerts or admin escalations only.
- [ ] Implement document generation, hash, storage adapter, download and annulment.
- [ ] Implement transactional per-type document numbering.

**Acceptance Gate:**

- Snapshot job can be run repeatedly for a date without corrupting metrics.
- La Torre endpoints render from persisted data, not hardcoded demo values.
- Workflows are idempotent for the same trigger context.
- Document hashes and numbers are stable and auditable.

## Stage 6: Frontend Foundation and F1a/F1b Screens

**Purpose:** Deliver the main web app for admin, personas, catalog, originacion, prestamos, caja and pagos.

**Child plan:** `docs/superpowers/plans/2026-06-11-frontend-foundation-f1ab.md`

**Files:**

- Frontend app under `frontend/`
- Generated or hand-written API client under `frontend/src/lib/api/`
- UI tests under `frontend/src/**/*.test.tsx` or chosen test layout

- [ ] Scaffold Vite React TypeScript app if missing.
- [ ] Add Tailwind, shadcn/ui, typography and tabular money styling.
- [ ] Add TanStack Router, Query and Table.
- [ ] Add auth session handling and RBAC-aware navigation.
- [ ] Add command palette.
- [ ] Build personas, BCRA, catalog, matrices and simulator screens.
- [ ] Build solicitudes, loans, payment, correction, caja and novation screens.
- [ ] Use OpenAPI-backed mocks where backend stage is not yet complete.

**Acceptance Gate:**

- Frontend typecheck and build pass.
- Money display never uses raw floats.
- Forms validate required fields client-side and show API errors.
- Critical F1a/F1b flows can be clicked through against dev API or contract mocks.

## Stage 7: Frontend F1c/F1d and La Ruta PWA

**Purpose:** Finish operational, executive and offline field UX.

**Child plan:** `docs/superpowers/plans/2026-06-11-frontend-operations-pwa-torre.md`

**Files:**

- PWA/offline modules under `frontend/src/features/ruta/`
- CRM/risk/vendor/treasury/tower/document screens under feature modules

- [ ] Implement La Ruta offline cache, queue, retry and sync status.
- [ ] Implement visit capture with amount, outcome, photo metadata, geotag metadata and notes.
- [ ] Implement rendicion UI.
- [ ] Implement CRM inbox, incidents, timeline, assignments and prospects.
- [ ] Implement risk board and alert management.
- [ ] Implement vendor commission and liquidation views.
- [ ] Implement treasury and La Torre dashboards.
- [ ] Implement document generation/list/download/annul UI.

**Acceptance Gate:**

- PWA can load an assigned route, go offline, record visits and sync later.
- Retried sync does not duplicate stops or payments.
- Dashboards show empty, loading, error and populated states.
- Mobile route UI is usable at common phone widths.

## Stage 8: Hardening, Seeds, Observability, Release Candidate

**Purpose:** Make the POC demoable and internally reliable.

**Child plan:** `docs/superpowers/plans/2026-06-11-hardening-demo-release-candidate.md`

**Files:**

- Seed scripts under `backend/scripts/` or `infra/seeds/`
- Operational docs under `docs/`
- E2E tests under chosen test layout

- [ ] Add the `web` (nginx) Docker Compose service serving the built frontend, completing the full spec §4 stack (`api`, `worker`, `beat`, `web`, `db`, `redis`).
- [ ] Add deterministic demo seed data for all modules.
- [ ] Add scheduled jobs for punitorios, aging, route generation, workflows, snapshots and backup.
- [ ] Add structured logs, request IDs and job logs.
- [ ] Add backup/restore documentation.
- [ ] Add full demo script.
- [ ] Add end-to-end smoke tests across persona, solicitud, loan, payment, route, risk and tower.
- [ ] Run full backend, frontend and Docker Compose verification.

**Acceptance Gate:**

- A clean checkout can be booted with documented commands.
- Demo seed produces a meaningful La Torre.
- Full verification commands pass.
- Known limitations are documented in the release notes.

## Cross-Stage Invariants

- `nexocred_core` remains pure and deterministic.
- Plans and technical docs may be written in English. Business/product concepts stay in Spanish across code, database schema, API domain names, UI text, roles, permissions, seeds and functional errors; common technical terms may remain in English when that is clearer (`test`, `backend`, `frontend`, `endpoint`, `payload`, `mock`, `fixture`, `worker`, `job`, `retry`, `lock`, `deploy`).
- Every financial endpoint uses `fecha_negocio`.
- Every money value uses Decimal in Python and string serialization in JSON.
- Financial records are append-only where corrections are needed.
- Operations that change balances use transactions and idempotency.
- WhatsApp remains absent from the POC.
- BCRA blocks approval, not persona creation.
- OpenAPI is updated at every backend stage before frontend work consumes it.

## Master Verification Checklist

- [ ] Open spec risks (§9: PRD reconciliation, 8-case minimum contract) are tracked and do not block the current stage; reconcile against PRD if/when it appears.
- [ ] Each stage has a child plan before code starts.
- [ ] Each child plan starts with failing tests.
- [ ] Stage acceptance gate passes before starting the next backend stage.
- [ ] Frontend stages consume frozen contracts or explicit mocks.
- [ ] Release candidate passes backend tests, frontend build/typecheck and Docker Compose smoke test.
