# Hardening, Seeds, Observability, Release Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the POC demoable and internally reliable: deterministic demo seeds across all modules, Celery beat scheduled jobs, structured logging + request IDs, backup/restore docs, a full demo script, a backend end-to-end smoke across the whole lifecycle, an anti-permissive-mock audit, a transactional-button (spinner/disable) audit on the frontend, and a final full verification pass.

**Architecture:** Seeds are an idempotent, deterministic Python script that builds a realistic portfolio through the existing services (so all invariants hold) and produces a meaningful La Torre. Beat schedules the existing job functions (punitorios/aging/snapshot/rutas/workflows) via the `worker`+`beat` compose services; the admin on-demand triggers remain for the demo. Logging adds request IDs and structured job logs. The end-to-end smoke runs the real lifecycle against the compose Postgres. Two quality audits address known risks: a sweep for permissive/fantasy mocks in tests, and a frontend sweep ensuring every transactional button disables + shows a spinner on first click.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 async, Celery + beat, Redis, Postgres 18, `structlog` (or stdlib logging with a JSON formatter), pytest, Docker Compose; frontend Vitest. Run backend in the `nexocred` conda env; frontend with npm.

---

## Execution Environment (read first)

- Backend via `conda run -n nexocred <cmd>`; pytest **from repo root**. Frontend via `npm` under `frontend/`.
- Postgres up: `docker compose up -d db`. Commit per task with inline identity: `git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "..."`.
- Do NOT regress: backend 349 tests, frontend (Stage-7 count after its fix). Money Decimal/string; fecha_negocio explicit; everything builds through the existing services (no raw SQL inserts that bypass invariants).
- Decisions already made: **E2E = backend-full + frontend smoke** (no Playwright); **jobs = Celery beat configured + admin triggers retained**.

---

## File Structure

```
backend/
  scripts/seed_demo.py            # CREATE: deterministic idempotent demo seed (uses services)
  scripts/backup.sh               # CREATE: pg_dump to a volume path
  scripts/restore.sh              # CREATE: pg_restore from a dump
  app/jobs/celery_app.py          # MODIFY: beat_schedule for nightly jobs
  app/jobs/{rutas.py,workflows_job.py}  # CREATE: route-generation + workflow-sweep job fns (thin)
  app/logging_setup.py            # CREATE: structured logging + request-id middleware
  app/main.py                     # MODIFY: install request-id middleware + logging
backend/tests/
  e2e/test_lifecycle_e2e.py       # CREATE: persona→...→Torre full lifecycle smoke
  test_seed_demo.py               # CREATE: seed is idempotent + produces meaningful Torre
  test_logging.py                 # CREATE: request id present, job logs structured
docker-compose.yml                # MODIFY: worker, beat, web services (full §4 stack)
docs/
  RUNBOOK.md                      # CREATE: local setup, stage order, backup/restore, demo script
  RELEASE_NOTES.md                # CREATE: what's done, known limitations
frontend/
  src/components/TransactionButton.tsx   # CREATE (if missing): disables + spinner on pending
  (audit) src/features/**/*              # ensure transactional buttons use it
```

---

## Task 1: Compose — worker, beat, web services (full §4 stack)

**Files:** `docker-compose.yml`; Test `backend/tests/test_compose_config.py`

- [ ] **Step 1: Write a failing test.** Parse `docker-compose.yml` (PyYAML) and assert services `api`, `db`, `redis`, `worker`, `beat`, `web` all exist; `worker`/`beat` run the Celery app; `web` serves the built frontend.

```python
import yaml


def test_compose_tiene_stack_completo():
    with open("docker-compose.yml") as f:
        compose = yaml.safe_load(f)
    servicios = set(compose["services"])
    for s in ["api", "db", "redis", "worker", "beat", "web"]:
        assert s in servicios, s
    assert "celery" in compose["services"]["worker"]["command"].lower()
    assert "beat" in compose["services"]["beat"]["command"].lower()
```

- [ ] **Step 2: Run, confirm fail.** `conda run -n nexocred python -m pytest backend/tests/test_compose_config.py -v` → FAIL.
- [ ] **Step 3: Implement.** Add `worker` (`celery -A app.jobs.celery_app worker`), `beat` (`celery -A app.jobs.celery_app beat`), and `web` (nginx serving `frontend/dist`, depends on a build stage) to `docker-compose.yml`, all sharing `DATABASE_URL`/`REDIS_URL`, depends_on db+redis healthy.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Validate compose.** `docker compose config >/dev/null && echo OK` → OK.
- [ ] **Step 6: Commit** `feat(infra): worker, beat y web en compose (stack §4 completo)`.

---

## Task 2: Beat schedule + route/workflow job functions

**Files:** `backend/app/jobs/{celery_app.py,rutas.py,workflows_job.py}`; Test `backend/tests/test_beat_schedule.py`, `backend/tests/services/test_jobs_rutas_workflows.py`

- [ ] **Step 1: Write failing tests.** `celery_app.conf.beat_schedule` contains entries for `punitorios`, `aging`, `snapshot`, `generar_rutas`, `barrer_workflows` with cron-like schedules; `generar_rutas_job(session, fecha)` creates routes for active cobradores; `barrer_workflows_job(session, contexto)` runs the §7.2 engine for the day's mora triggers. Pure/transactional, tested directly.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the two job functions (thin, reuse m05 route gen + workflows motor) and a `beat_schedule` dict (e.g. punitorios 02:00, aging 02:30, snapshot 03:00, rutas 06:00, workflows hourly). Keep `task_always_eager` off; tests call the functions directly.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(jobs): beat schedule + jobs de generacion de rutas y barrido de workflows`.

---

## Task 3: Structured logging + request IDs

**Files:** `backend/app/logging_setup.py`, `backend/app/main.py`; Test `backend/tests/test_logging.py`

- [ ] **Step 1: Write failing tests.** A request through the app carries an `X-Request-ID` (generated if absent, echoed if provided) in the response header; log records include the request id and are JSON-structured; a job log helper emits structured records with the job name + fecha.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** a request-id ASGI middleware (contextvar), a JSON log formatter, and `log_job(nombre, **campos)`. Install in `crear_app()`.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(obs): logging estructurado, request-id middleware y logs de job`.

---

## Task 4: Deterministic demo seed

**Files:** `backend/scripts/seed_demo.py`; Test `backend/tests/test_seed_demo.py`

- [ ] **Step 1: Write failing tests.** `sembrar_demo(session, *, semilla=42)` builds, through the existing services: usuarios (one per rol), productos+matrices, ~20 personas (valid CUILs from a deterministic generator) with BCRA, solicitudes→desembolsos (loans with snapshots+cuotas), a spread of pagos (some in mora), a route+visits+rendición, commissions+a liquidación, alerts, and a snapshot_cartera. **Idempotent:** running twice does not duplicate (guard by a deterministic marker, e.g. a fixed admin email / a `seed_demo` parametro). Assert: counts are stable on re-run; `generar_snapshot` then `torre/pulso` returns non-zero KPIs (meaningful Torre).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `seed_demo.py` using the service layer (so all invariants hold; money Decimal; deterministic dates via a fixed `fecha_negocio` base, not `today()`), idempotent via existence checks. Provide a `python -m scripts.seed_demo` entrypoint.
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `feat(seed): demo determinista e idempotente con Torre significativa`.

---

## Task 5: Backend end-to-end lifecycle smoke

**Files:** `backend/tests/e2e/test_lifecycle_e2e.py`

- [ ] **Step 1: Write the e2e test.** Against the test DB, exercise the real lifecycle through the API/services and assert money conservation + state at each step: crear persona → BCRA sync → solicitud → evaluar → aprobar → desembolsar (loan+snapshot+cuotas+caja) → registrar pago (waterfall reconciles) → generar ruta → visitar/sync (idempotent) → rendición (reconciles) → comisión devengo → liquidación pagar (caja egreso reconciles) → generar snapshot → `torre/pulso` reflects the activity → generar documento (hash/numero) → corrección (append-only). Assert the full chain end to end.
- [ ] **Step 2: Run, confirm it passes** (the features exist). `conda run -n nexocred python -m pytest backend/tests/e2e -v`.
- [ ] **Step 3: Commit** `test(e2e): smoke de ciclo completo persona→...→Torre con conservacion de dinero`.

---

## Task 6: Anti-permissive-mock audit (test quality sweep)

**Files:** `backend/tests/**`, `frontend/src/**/*.test.*` (fixes as found); report `docs/AUDIT_MOCKS.md`

- [ ] **Step 1: Sweep for fantasy/permissive mocks.** Identify tests that (a) mock the very unit under test, (b) assert on a mock's own return rather than real behavior, (c) use a fake BCRA/storage/clock so loosely that the assertion can never fail, or (d) patch a service to a constant that bypasses the logic being claimed as tested. List each in `docs/AUDIT_MOCKS.md` with a verdict.
- [ ] **Step 2: Strengthen or replace** the weak ones: make the assertion exercise real behavior (e.g. assert the waterfall output, not that a mock was called); keep legitimate boundary fakes (FakeBcraClient, StorageLocal) but ensure the assertion tests the code around them. Each fix is TDD: tighten the test so it would FAIL on a plausible regression, confirm it still passes on correct code.
- [ ] **Step 3: Run the full suites** to confirm no regression after tightening. `conda run -n nexocred python -m pytest -q` and `cd frontend && npm run test`.
- [ ] **Step 4: Commit** `test(audit): endurecer mocks permisivos; documentar barrido en AUDIT_MOCKS.md`.

---

## Task 7: Frontend transactional-button audit (spinner/disable)

**Files:** `frontend/src/components/TransactionButton.tsx`, transactional screens; Test `frontend/src/components/transactionbutton.test.tsx`

- [ ] **Step 1: Write failing tests.** A `TransactionButton` disables immediately on click and shows a spinner while `pending`, preventing a second submit; a test per critical action (registrar pago, desembolsar, corregir, liquidación pagar, documento generar, aporte/retiro, sync) asserts the button is disabled during the in-flight mutation.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `TransactionButton` (wraps a button with `isPending` → disabled + spinner) and refactor each transactional action button to use it (or assert the existing TanStack `isPending` disable is present). Sweep all 17 screens; list any button that mutates money/state and lacks the guard, and fix it.
- [ ] **Step 4: Run, confirm green** + full frontend gate (`typecheck`/`test`/`build`).
- [ ] **Step 5: Commit** `feat(frontend): TransactionButton con disable+spinner en toda accion transaccional`.

---

## Task 8: Backup/restore + RUNBOOK + RELEASE_NOTES + demo script

**Files:** `backend/scripts/{backup.sh,restore.sh}`, `docs/RUNBOOK.md`, `docs/RELEASE_NOTES.md`; Test `backend/tests/test_scripts_existen.py`

- [ ] **Step 1: Write a failing test.** Assert `scripts/backup.sh` and `scripts/restore.sh` exist and are executable, and `docs/RUNBOOK.md`/`docs/RELEASE_NOTES.md` exist with required sections (setup, stage order, backup/restore, demo script in RUNBOOK; done/known-limitations in RELEASE_NOTES).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `backup.sh` (`pg_dump` to a timestamped file in a volume path), `restore.sh` (`pg_restore`), `RUNBOOK.md` (clone→`docker compose up`→`alembic upgrade head`→`python -m scripts.seed_demo`→open web→demo click-path; backup/restore commands), `RELEASE_NOTES.md` (modules delivered, the documented known limitations: historical as-of risk reconstruction deferred, business-policy decisions pending — imputation order, excedente handling, offline-strict-for-mostrador).
- [ ] **Step 4: Run, confirm green.**
- [ ] **Step 5: Commit** `docs(rc): backup/restore, RUNBOOK y RELEASE_NOTES con limitaciones conocidas`.

---

## Task 9: Final full verification pass

**Files:** none (verification); update `docs/RELEASE_NOTES.md` with the verification results.

- [ ] **Step 1: Backend full suite.** `docker compose up -d db && conda run -n nexocred python -m pytest -q` → all green (349 + Stage-8 additions).
- [ ] **Step 2: Clean-DB migrations.** Drop scratch DB, `DATABASE_URL_SYNC=... alembic upgrade head` → reaches latest revision.
- [ ] **Step 3: Lint + typecheck.** `conda run -n nexocred ruff check backend && conda run -n nexocred pyright backend/app` → clean.
- [ ] **Step 4: Frontend gate.** `cd frontend && npm run typecheck && npm run test && npm run build` → green.
- [ ] **Step 5: Compose smoke.** `docker compose config >/dev/null` valid; (optionally) `docker compose up -d` and curl `/healthcheck` → `{"estado":"ok"}`.
- [ ] **Step 6: Seed + Torre check.** Seed a clean DB and confirm `torre/pulso` returns meaningful non-zero KPIs.
- [ ] **Step 7: Record results** in `RELEASE_NOTES.md` and commit `chore(rc): verificacion final — release candidate verde`.

---

## Acceptance Gate (maps to master-plan Stage 8)

- [ ] A clean checkout can be booted with documented commands (Task 8 RUNBOOK, Task 9 Step 5).
- [ ] Demo seed produces a meaningful La Torre (Task 4, Task 9 Step 6).
- [ ] Full verification commands pass (Task 9).
- [ ] Known limitations are documented in the release notes (Task 8).
- [ ] Scheduled jobs exist for punitorios, aging, route generation, workflows, snapshots and backup (Tasks 1,2,8).
- [ ] Structured logs + request IDs + job logs (Task 3).
- [ ] End-to-end smoke across persona, solicitud, loan, payment, route, risk and tower (Task 5).
- [ ] Test-quality (anti-permissive-mock) and transactional-button audits done (Tasks 6,7).

---

## Self-Review against master-plan Stage 8 + user checklist

- **Deterministic demo seed all modules** → Task 4. ✅
- **Scheduled jobs (punitorios/aging/rutas/workflows/snapshots/backup)** → Tasks 1,2,8. ✅
- **Structured logs, request IDs, job logs** → Task 3. ✅
- **Backup/restore docs** → Task 8. ✅
- **Full demo script** → Task 8 (RUNBOOK). ✅
- **E2E smoke across all modules** → Task 5. ✅
- **Full backend/frontend/compose verification** → Task 9. ✅
- **User checklist add-ons:** anti-permissive-mock audit → Task 6; transactional-button spinner/disable audit → Task 7. ✅
- **Known limitations documented** (historical as-of reconstruction; pending business-policy decisions: imputation order vs §5.4, excedente handling, offline-strict for mostrador) → Task 8 RELEASE_NOTES. ✅
- **Out of scope (post-POC):** Playwright browser e2e (deferred per decision); the three business-policy decisions are flagged for product sign-off, not invented.
```
