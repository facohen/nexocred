# Frontend F1c/F1d + La Ruta PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the operational, executive and offline field UX: La Ruta as an offline PWA (cache + IndexedDB queue + Background-Sync-triggered idempotent sync), visit capture, rendición, CRM inbox/incidents/timeline/prospects, risk board + alerts, vendor commissions/liquidations, treasury + La Torre dashboards (Tremor), and document generate/list/download/annul.

**Architecture:** Extends the Stage 6 frontend. La Ruta's offline logic is a **pure, testable queue module** over IndexedDB (visits/payments stamped with a device UUIDv7), exercised in tests with `fake-indexeddb` + MSW; the **Background Sync API** is the production trigger (a service worker replays the queue via `POST /rutas/{id}/sync` when connectivity returns), with a manual "Sincronizar" button + on-focus retry as the fallback for browsers without Background Sync. Dashboards (La Torre, riesgo, tesorería) render from the frozen `f1c.json`/`f1d.json` contracts via the typed client + MSW, using Tremor charts. Money stays string + `tabular-nums` throughout; RBAC guards every route.

**Tech Stack:** Node 20, Vite 5, React 18, TS 5, Tailwind, shadcn/ui, TanStack Router/Query/Table, Tremor (Recharts), `vite-plugin-pwa` (Workbox), `idb` (IndexedDB), `fake-indexeddb` (tests), MSW, Vitest + @testing-library/react. Consumes `docs/openapi/{f1c,f1d}.json`.

---

## Execution Environment (read first)

- ALL work under `frontend/` with `npm` (Node 20). Does NOT touch `backend/` or Postgres.
- Consume the FROZEN contracts `docs/openapi/f1c.json` and `docs/openapi/f1d.json` (committed). Regenerate the typed schema to include them. MSW for dev/tests — builds/tests with no backend.
- Commit per task: `git -c user.name="NexoCred Dev" -c user.email="c.federico@gmail.com" commit -m "..."`.
- Gate per task: `npm run typecheck && npm run test && npm run build`. Do NOT regress the 69 Stage-6 tests.
- Money: string + `MoneyText`/`tabular-nums`; never `Number()`/`parseFloat` on currency. RBAC: every new route guarded via the Stage-6 `enforceRoles`/`ROUTE_ROLES`.
- Reuse Stage 6: `lib/api/client.ts`, `lib/money.ts`, `lib/auth.ts`, `components/{MoneyText,DataTable,FormField}`, `routes/guards.ts`.

---

## File Structure

```
frontend/
  vite.config.ts            # MODIFY: add vite-plugin-pwa (Workbox) for La Ruta
  src/lib/api/schema.d.ts   # REGEN: include f1c + f1d
  src/features/ruta/
    db.ts                   # idb wrapper: cola de visitas/pagos (device UUIDv7), estados pendiente/sincronizado/error
    queue.ts                # pure logic: encolar, listarPendientes, marcarSincronizado, construirBatch
    sync.ts                 # sincronizarRuta(api, rutaId): POST /rutas/{id}/sync, reconcile per-item result
    useOnline.ts            # connectivity hook + manual/auto trigger
    sw-sync.ts              # Background Sync registration (service worker glue, feature-detected)
    RutaPage.tsx            # cargar ruta asignada, lista de paradas, estado de sync
    VisitaCaptureForm.tsx   # monto, resultado, foto(meta), geotag(meta), notas
    RendicionPage.tsx       # cierre de rendición + descargos
    *.test.tsx / *.test.ts
  src/features/crm/{InboxPage,IncidentesPage,TimelinePanel,AsignacionesPage,ProspectosPage}.tsx
  src/features/riesgo/{RiesgoBoard,AlertasPage}.tsx
  src/features/vendedores/{ComisionesPage,LiquidacionesPage}.tsx
  src/features/tesoreria/{TesoreriaDashboard}.tsx
  src/features/torre/{TorreDashboard}.tsx     # Tremor cards/charts
  src/features/documentos/{DocumentosPage}.tsx
  src/mocks/handlers.ts     # EXTEND: f1c/f1d endpoints
  src/routes/router.tsx     # EXTEND: new routes + role guards
```

---

## Task 1: Regenerate typed schema (f1c+f1d) + extend MSW handlers

**Files:** `src/lib/api/schema.d.ts`, `src/mocks/{handlers.ts,fixtures.ts}`; Test `src/mocks/handlers_f1cd.test.ts`

- [ ] **Step 1: Write failing test.** MSW resolves `GET /api/v1/torre/pulso`, `GET /api/v1/riesgo/tablero`, `GET /api/v1/rutas`, `GET /api/v1/documentos/{id}` to fixtures with money strings.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement.** Regenerate `schema.d.ts` from a merged f1b+f1c+f1d (run `openapi-typescript` on each, or the latest superset). Add fixtures (rutas/paradas, rendiciones, tareas/incidentes/timeline/prospectos, riesgo tablero/cosechas, alertas, comisiones/liquidaciones, tesorería posición/cashflow, torre resumen/pulso/salud/operacion/negocio/alertas-live, documentos). Add MSW handlers for the f1c/f1d endpoints the screens use.
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(frontend): schema f1c/f1d + mocks de operaciones, riesgo, torre, documentos`.

---

## Task 2: La Ruta — IndexedDB queue (pure, fake-indexeddb tests)

**Files:** `src/features/ruta/{db.ts,queue.ts}`; Test `src/features/ruta/queue.test.ts`

- [ ] **Step 1: Write failing tests** (with `fake-indexeddb/auto`). `encolarVisita(v)` stores a visit with a device UUIDv7 id and `estado='pendiente'`; `listarPendientes()` returns them; `marcarSincronizado(id)` flips state; `construirBatch(rutaId)` returns the `{paradas:[...]}` payload shape `POST /rutas/{id}/sync` expects (device `id` + `pago_id`, resultado, monto, geotag). Re-`encolar` of the same device id is idempotent (no duplicate row).

```ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { encolarVisita, listarPendientes, construirBatch, _reset } from "./queue";

describe("cola offline", () => {
  beforeEach(async () => { await _reset(); });
  it("encola y construye batch idempotente", async () => {
    const v = { id: "uuidv7-1", paradaId: "p1", prestamoId: "L1", resultado: "pago",
                montoCobrado: "2200.00", pagoId: "uuidv7-pago-1" };
    await encolarVisita(v);
    await encolarVisita(v); // mismo id → no duplica
    expect((await listarPendientes()).length).toBe(1);
    const batch = await construirBatch("R1");
    expect(batch.paradas[0].id).toBe("uuidv7-1");
    expect(batch.paradas[0].pago_id).toBe("uuidv7-pago-1");
  });
});
```

- [ ] **Step 2: Run, confirm fail.** Install `idb` + `fake-indexeddb` as dev dep.
- [ ] **Step 3: Implement** `db.ts` (idb open/upgrade, `visitas` store keyed by device id) + `queue.ts` (encolar/listar/marcar/construirBatch + `_reset` for tests). Generate device UUIDv7 (a small `uuidv7()` util).
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(ruta): cola offline IndexedDB con UUIDv7 de dispositivo`.

---

## Task 3: La Ruta — sync + connectivity + Background Sync trigger

**Files:** `src/features/ruta/{sync.ts,useOnline.ts,sw-sync.ts}`; Test `src/features/ruta/sync.test.ts`

- [ ] **Step 1: Write failing tests** (MSW + fake-indexeddb). `sincronizarRuta(rutaId)` posts the batch to `/rutas/{id}/sync`, marks each `aplicada`/`omitida`/`rechazada` item per the backend response, and is safe to call twice (a replay leaves the server idempotent and the queue converges to synced). A `rechazada` item stays queued with `estado='error'` + reason.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `sync.ts` (build batch → POST → reconcile per-item → mark queue), `useOnline.ts` (navigator.onLine + online event → auto-trigger), `sw-sync.ts` (feature-detected Background Sync registration; falls back to online-event/manual when unsupported). Document the SW-vs-test split: the queue/sync logic is unit-tested; Background Sync is the production wakeup that calls the same `sincronizarRuta`.
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(ruta): sync idempotente, deteccion de conectividad y disparo Background Sync`.

---

## Task 4: La Ruta — PWA shell (Workbox) + route page + visit capture

**Files:** `vite.config.ts`, `src/features/ruta/{RutaPage,VisitaCaptureForm}.tsx`; Test `src/features/ruta/ruta.test.tsx`

- [ ] **Step 1: Write failing tests.** RutaPage loads the assigned route (mock), lists paradas with saldo (MoneyText), shows a sync-status badge (pendientes count); VisitaCaptureForm captures resultado/monto/foto-meta/geo-meta/notas, and on submit while "offline" enqueues (does NOT POST), while "online" enqueues + triggers sync. Assert an offline submit adds to the queue and shows "pendiente".
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** `vite-plugin-pwa` (Workbox: precache app shell, runtime-cache the assigned route GET), RutaPage (mobile-friendly), VisitaCaptureForm (writes to the queue; foto/geo as metadata only). Add the manual "Sincronizar" button.
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(ruta): PWA shell Workbox, pantalla de ruta y captura de visita offline`.

---

## Task 5: La Ruta — rendición UI

**Files:** `src/features/ruta/RendicionPage.tsx`; Test `src/features/ruta/rendicion.test.tsx`

- [ ] **Step 1: Write failing tests.** RendicionPage shows total cobrado, lets you add descargos, displays `diferencia = cobrado − descargos aprobados`, and the lifecycle action (presentar). Money via MoneyText; error envelope surfaced.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the rendición screen against `/rendiciones` endpoints.
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(ruta): UI de rendicion con descargos y diferencia`.

---

## Task 6: CRM — inbox, incidentes, timeline, asignaciones, prospectos

**Files:** `src/features/crm/*`; Test `src/features/crm/crm.test.tsx`

- [ ] **Step 1: Write failing tests.** Inbox lists the operator's tareas (scoped), completar records an interacción; incidentes CRUD; TimelinePanel renders the unified persona timeline (interacciones+incidentes+credit events+novación) time-ordered; asignaciones (single + masivo, admin); prospectos pipeline with promote.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the CRM screens against `/tareas`,`/incidentes`,`/interacciones`,`/personas/{id}/timeline`,`/crm/asignaciones`,`/prospectos`.
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(crm): inbox, incidentes, timeline 360, asignaciones y prospectos`.

---

## Task 7: Riesgo board + alertas

**Files:** `src/features/riesgo/*`; Test `src/features/riesgo/riesgo.test.tsx`

- [ ] **Step 1: Write failing tests.** RiesgoBoard renders PAR30/60/90, aging, concentración, cosechas (Tremor charts) from the tablero mock with money strings; AlertasPage lists active alerts, resolver (justificación) and asignar (creates a task — reflected in UI). Empty/loading/error states present.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** the risk dashboard (Tremor) + alert management against `/riesgo/*`,`/alertas/*`.
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(riesgo): tablero PAR/aging/cosechas y gestion de alertas`.

---

## Task 8: Vendedores — comisiones + liquidaciones

**Files:** `src/features/vendedores/*`; Test `src/features/vendedores/vendedores.test.tsx`

- [ ] **Step 1: Write failing tests.** ComisionesPage shows devengadas/confirmadas/clawbacks/liquidadas for a vendor (money strings); LiquidacionesPage lists liquidaciones, generate (period), aprobar (admin), pagar (Idempotency-Key, reflects caja egreso). Error states.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** against `/vendedores/{id}/*`,`/comisiones/*`.
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(vendedores): comisiones, clawbacks y liquidaciones`.

---

## Task 9: Tesorería + La Torre dashboards (Tremor)

**Files:** `src/features/tesoreria/TesoreriaDashboard.tsx`, `src/features/torre/TorreDashboard.tsx`; Test `src/features/tesoreria/tesoreria.test.tsx`, `src/features/torre/torre.test.tsx`

- [ ] **Step 1: Write failing tests.** TesoreriaDashboard renders posición (semáforo)/cashflow/DCF/rotación + aporte/retiro actions (money strings). TorreDashboard renders resumen (Índice Nexo), pulso (5 cards), salud-cartera, operación-hoy, negocio, alertas-live (deep-links) from the snapshot-backed mocks — **assert values come from the API mock, with an explicit empty state when the torre endpoints return zeros/empty (no snapshot)**. Loading/error states.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** both dashboards with Tremor cards/charts against `/tesoreria/*` and `/torre/*`.
- [ ] **Step 4: Run gate.**
- [ ] **Step 5: Commit** `feat(torre): dashboards de tesoreria y La Torre con Tremor`.

---

## Task 10: Documentos UI + Stage 7 gate

**Files:** `src/features/documentos/DocumentosPage.tsx`; Test `src/features/documentos/documentos.test.tsx`

- [ ] **Step 1: Write failing tests.** DocumentosPage lists a loan's documents, generar (tipo, Idempotency-Key), descargar (link), anular (motivo) — shows numero + hash; annulled docs marked. Error states.
- [ ] **Step 2: Run, confirm fail.** Implement against `/documentos/*`, `/prestamos/{id}/documentos`.
- [ ] **Step 3: Full gate.** `npm run typecheck && npm run test && npm run build` → all green (69 Stage-6 + Stage-7).
- [ ] **Step 4: Money-float + RBAC audit.** No `Number()/parseFloat` on money; every new route guarded; mobile widths usable for RutaPage (assert a responsive class/layout test).
- [ ] **Step 5: Commit** `feat(documentos): UI generar/descargar/anular + Stage 7 gate verde`.

---

## Acceptance Gate (maps to master-plan Stage 7)

- [ ] PWA can load an assigned route, go offline, record visits and sync later (Tasks 2–4).
- [ ] Retried sync does not duplicate stops or payments (Task 3: idempotent by device UUIDv7).
- [ ] Dashboards show empty, loading, error and populated states (Tasks 7, 9).
- [ ] Mobile route UI is usable at common phone widths (Task 4, Task 10 audit).
- [ ] Money never uses raw floats; every route RBAC-guarded (Task 10 audit).

---

## Self-Review against spec §4 (frontend/PWA) and master-plan Stage 7

- **La Ruta offline cache/queue/retry/sync status** → Tasks 2,3,4. ✅ (Workbox cache + IndexedDB queue + Background Sync trigger + manual fallback.)
- **Visit capture (amount/outcome/photo-meta/geotag/notes)** → Task 4. ✅
- **Rendición UI** → Task 5. ✅
- **CRM inbox/incidents/timeline/assignments/prospects** → Task 6. ✅
- **Risk board + alert management** → Task 7. ✅
- **Vendor commission + liquidation views** → Task 8. ✅
- **Treasury + La Torre dashboards (Tremor)** → Task 9. ✅
- **Document generate/list/download/annul UI** → Task 10. ✅
- **Retried sync no duplicate stops/payments** → Task 3 (device UUIDv7 idempotency, matches backend). ✅
- **Dashboards empty/loading/error/populated; mobile route UI** → Tasks 7,9,10. ✅
- **Note on Background Sync vs tests:** the queue/sync logic is unit-tested with fake-indexeddb+MSW (deterministic); Background Sync API is the production wakeup that calls the same tested `sincronizarRuta`, with online-event/manual fallback for unsupported browsers. A full SW offline e2e (Playwright) is deferred to Stage 8 if desired.
```
