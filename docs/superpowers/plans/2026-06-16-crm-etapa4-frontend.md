# CRM Etapa 4 Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement DashboardFilterBar zona/sector wiring, InteraccionForm catalog dropdowns, and PromesasPanel with new-promesa form, all integrated in their respective host pages.

**Architecture:** Three independent deliverables — (1) wiring DashboardFilterBar into RiesgoBoard (already partially done via useState), (2) updating InteraccionForm which already exists but needs integration in InboxPage as a modal, (3) creating PromesasPanel (new component) with useCrearPromesa mutation added to crm/hooks.ts and mounted in PrestamoDetailPage. Tests use existing MSW server + renderWithProviders pattern.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest + RTL + MSW, Tailwind with `hsl(var(--token))` design tokens, Geist Mono for numbers, react-hook-form + Zod already installed.

---

## Codebase Context (read before implementing)

### Key existing files

- `frontend/src/components/filters/DashboardFilterBar.tsx` — already exists. Exports `DashboardFilterBar`, `FiltroZonaSector`, `FILTRO_ZONA_SECTOR_VACIO`.
- `frontend/src/features/crm/hooks.ts` — `usePromesas(prestamoId?, estado?)` exists. `useCrearPromesa` does NOT exist yet (must be added).
- `frontend/src/features/crm/InteraccionForm.tsx` — already fully implemented. Accepts `{ personaId, tareaId?, onCreated? }`. Uses `useTemas()`, `useCanales()`, `useDisposiciones()`, `useCrearInteraccion()`.
- `frontend/src/features/crm/InboxPage.tsx` — 962 lines. Has three tabs (tareas, incidentes, prospectos). No modal for InteraccionForm yet.
- `frontend/src/features/riesgo/RiesgoBoard.tsx` — already uses `DashboardFilterBar` via local `useState`. Filter is wired to `useTablero(filtro)`, `useCosechas(filtro)`, `useConcentracion(filtro)`.
- `frontend/src/features/torre/TorreDashboard.tsx` — already uses `DashboardFilterBar` + `useState`. Only `useResumen(filtro)` receives it; `usePulso`, `useSaludCartera`, `useOperacionHoy`, `useNegocio`, `useAlertasLive` do NOT take filtro.
- `frontend/src/features/tesoreria/TesoreriaDashboard.tsx` — already uses `DashboardFilterBar` + `useState`. Only `usePosicion(filtro)` receives it.
- `frontend/src/features/analytics/AnalisisCarteraPage.tsx` — already uses `DashboardFilterBar` + `useState`. Both `useResumenAnalytics(filtro)` and `useRentabilidad(dimension, filtro)` receive it.
- `frontend/src/features/prestamos/PrestamoDetailPage.tsx` — 632 lines. No PromesasPanel yet. Ends with `</div></div>` at line 601 (closing the main layout div).
- `frontend/src/mocks/fixtures.ts` — has `export const promesas = [{ id: "promesa-1", prestamo_id: "prestamo-1", ... }]`.
- `frontend/src/mocks/handlers.ts` — has `GET /promesas` (filters by `prestamo_id`), `POST /promesas` (returns 201 with `{ id: "promesa-new", ... }`).
- `frontend/src/mocks/server.ts` — exports `server` for test use.
- `frontend/src/test/utils.tsx` — exports `renderWithProviders(ui, sessionUser?)`.

### Design token reference

```
hsl(var(--brand))         hsl(var(--brand-subtle))
hsl(var(--pos))           hsl(var(--pos-bg))        hsl(var(--pos-border))
hsl(var(--warn))          hsl(var(--warn-bg))       hsl(var(--warn-border))
hsl(var(--neg))           hsl(var(--neg-bg))        hsl(var(--neg-border))
hsl(var(--text))          hsl(var(--text-muted))    hsl(var(--text-subtle))
hsl(var(--surface))       hsl(var(--surface-sunken))
hsl(var(--border))        hsl(var(--border-strong))
```

Tailwind shorthand (configured): `text-pos`, `bg-neg-bg`, `border-warn-border`, etc.
Geist Mono: `style={{ fontFamily: "'Geist Mono', monospace" }}` — const `MONO` defined locally per file.

### State pattern for filtro in dashboards

```typescript
const [filtro, setFiltro] = useState<FiltroZonaSector>(FILTRO_ZONA_SECTOR_VACIO);
// then pass filtro to hooks, render <DashboardFilterBar filtro={filtro} onChange={setFiltro} />
```

All four dashboards already follow this pattern. NO URL params are used for filtro in this codebase.

### apiFetch query param pattern

```typescript
apiFetch<T>("/endpoint", { query: { zona_id: filtro.zona_id || undefined, sector_id: filtro.sector_id || undefined } })
```

Empty string is also filtered by `buildUrl`. Query key must include the filter values.

---

## File Structure

### Files to create
- `frontend/src/features/crm/PromesasPanel.tsx` — new component
- `frontend/src/features/crm/PromesasPanel.test.tsx` — tests
- `frontend/src/features/crm/InteraccionForm.test.tsx` — tests (InteraccionForm already exists)

### Files to modify
- `frontend/src/features/crm/hooks.ts` — add `useCrearPromesa` mutation
- `frontend/src/features/crm/InboxPage.tsx` — add "+ Nueva interacción" modal with `InteraccionForm`
- `frontend/src/features/prestamos/PrestamoDetailPage.tsx` — add `<PromesasPanel>` section

### Files confirmed already correct (no changes needed)
- `frontend/src/features/riesgo/RiesgoBoard.tsx` — DashboardFilterBar already wired
- `frontend/src/features/torre/TorreDashboard.tsx` — DashboardFilterBar already wired
- `frontend/src/features/tesoreria/TesoreriaDashboard.tsx` — DashboardFilterBar already wired
- `frontend/src/features/analytics/AnalisisCarteraPage.tsx` — DashboardFilterBar already wired
- `frontend/src/features/crm/InteraccionForm.tsx` — already fully implemented
- `frontend/src/components/filters/DashboardFilterBar.tsx` — already exists

---

## Task 1: Add useCrearPromesa to crm/hooks.ts

**Files:**
- Modify: `frontend/src/features/crm/hooks.ts` (add after line 147, end of file)

- [ ] **Step 1: Read the file to confirm current end**

  Run: `tail -25 frontend/src/features/crm/hooks.ts`
  Expected: The file ends after the `usePromesas` function at line 147.

- [ ] **Step 2: Add useCrearPromesa mutation**

  Append to the end of `frontend/src/features/crm/hooks.ts`:

  ```typescript
  export interface PromesaIn {
    prestamo_id: string;
    monto_prometido: string;
    fecha_prometida: string;
    canal_origen?: string | null;
    interaccion_id?: string | null;
  }

  export interface PromesaOut {
    id: string;
    prestamo_id: string;
    monto_prometido: string;
    fecha_prometida: string;
    estado: string;
    canal_origen: string | null;
    interaccion_id: string | null;
    parada_ruta_id: string | null;
    created_at: string;
  }

  export function useCrearPromesa() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: PromesaIn) =>
        apiFetch<PromesaOut>("/promesas", { method: "POST", body }),
      onSuccess: (_, vars) => {
        qc.invalidateQueries({ queryKey: ["promesas", vars.prestamo_id] });
      },
    });
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run from `frontend/`: `npx tsc --noEmit 2>&1 | head -30`
  Expected: No errors related to hooks.ts.

---

## Task 2: Create PromesasPanel component

**Files:**
- Create: `frontend/src/features/crm/PromesasPanel.tsx`

- [ ] **Step 1: Write the failing test first**

  Create `frontend/src/features/crm/PromesasPanel.test.tsx`:

  ```typescript
  import { describe, it, expect, beforeEach } from "vitest";
  import { screen, waitFor } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { renderWithProviders } from "@/test/utils";
  import { setToken, setSessionUser } from "@/lib/auth";
  import { PromesasPanel } from "./PromesasPanel";

  beforeEach(() => {
    setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
    setSessionUser({ email: "op@nexocred.test", nombre: "Op", roles: ["administrativo"] });
  });

  describe("PromesasPanel", () => {
    it("muestra la lista de promesas del préstamo con estado coloreado", async () => {
      renderWithProviders(<PromesasPanel prestamoId="prestamo-1" />);
      // monto y fecha de promesa-1 del fixture
      expect(await screen.findByText(/50\.000/)).toBeInTheDocument();
      expect(screen.getByText(/2026-07-01/)).toBeInTheDocument();
      // badge de estado vigente usa color brand
      const badge = screen.getByText(/vigente/i);
      expect(badge).toBeInTheDocument();
    });

    it("abre formulario de nueva promesa y crea exitosamente", async () => {
      const user = userEvent.setup();
      renderWithProviders(<PromesasPanel prestamoId="prestamo-1" />);
      await screen.findByText(/50\.000/);

      await user.click(screen.getByRole("button", { name: /nueva promesa/i }));
      expect(screen.getByLabelText(/monto prometido/i)).toBeInTheDocument();

      await user.clear(screen.getByLabelText(/monto prometido/i));
      await user.type(screen.getByLabelText(/monto prometido/i), "75000");
      await user.clear(screen.getByLabelText(/fecha prometida/i));
      await user.type(screen.getByLabelText(/fecha prometida/i), "2026-08-01");
      await user.click(screen.getByRole("button", { name: /guardar promesa/i }));

      await waitFor(() =>
        expect(screen.queryByLabelText(/monto prometido/i)).not.toBeInTheDocument()
      );
    });

    it("muestra estado vacío cuando no hay promesas para el préstamo", async () => {
      renderWithProviders(<PromesasPanel prestamoId="prestamo-sin-promesas" />);
      expect(await screen.findByText(/sin promesas/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the test to confirm it fails**

  Run from `frontend/`: `npx vitest run src/features/crm/PromesasPanel.test.tsx 2>&1 | tail -20`
  Expected: FAIL — "Cannot find module './PromesasPanel'"

- [ ] **Step 3: Create PromesasPanel.tsx**

  Create `frontend/src/features/crm/PromesasPanel.tsx`:

  ```typescript
  import { useState } from "react";
  import { useForm } from "react-hook-form";
  import { z } from "zod";
  import { MoneyText } from "@/components/MoneyText";
  import { Button } from "@/components/ui/button";
  import { ApiError } from "@/lib/api/client";
  import { usePromesas, useCrearPromesa, type PromesaIn } from "./hooks";

  const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

  // ─── Estado → color semántico ─────────────────────────────────────────────────

  type EstadoColor = { text: string; bg: string; border: string };

  const ESTADO_COLOR: Record<string, EstadoColor> = {
    vigente: { text: "text-brand", bg: "bg-brand-subtle", border: "border-brand/20" },
    cumplida: { text: "text-pos", bg: "bg-pos/10", border: "border-pos/25" },
    parcial: { text: "text-warn", bg: "bg-warn/10", border: "border-warn/25" },
    rota: { text: "text-neg", bg: "bg-neg/10", border: "border-neg/25" },
  };

  const FALLBACK_COLOR: EstadoColor = {
    text: "text-text-muted",
    bg: "bg-surface-sunken",
    border: "border-border",
  };

  function estadoColor(estado: string): EstadoColor {
    return ESTADO_COLOR[estado.toLowerCase()] ?? FALLBACK_COLOR;
  }

  // ─── Formulario nueva promesa ─────────────────────────────────────────────────

  const CANALES_CALL = ["call", "campo", "WhatsApp", "email"] as const;

  const promesaSchema = z.object({
    monto_prometido: z.string().min(1, "El monto es obligatorio"),
    fecha_prometida: z.string().min(1, "La fecha es obligatoria"),
    canal_origen: z.string().optional(),
  });

  type PromesaFormValues = z.infer<typeof promesaSchema>;

  function zodResolver(s: typeof promesaSchema) {
    return async (values: PromesaFormValues) => {
      const result = s.safeParse(values);
      if (result.success) return { values: result.data, errors: {} };
      const errors: Record<string, { type: string; message: string }> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        if (!errors[key]) errors[key] = { type: "validation", message: issue.message };
      }
      return { values: {}, errors };
    };
  }

  function NuevaPromesaForm({
    prestamoId,
    onCreated,
  }: {
    prestamoId: string;
    onCreated: () => void;
  }) {
    const {
      register,
      handleSubmit,
      reset,
      formState: { errors },
    } = useForm<PromesaFormValues>({ resolver: zodResolver(promesaSchema) });

    const crear = useCrearPromesa();
    const [apiError, setApiError] = useState<string | null>(null);

    async function onSubmit(values: PromesaFormValues) {
      setApiError(null);
      const body: PromesaIn = {
        prestamo_id: prestamoId,
        monto_prometido: values.monto_prometido,
        fecha_prometida: values.fecha_prometida,
        canal_origen: values.canal_origen || null,
      };
      try {
        await crear.mutateAsync(body);
        reset();
        onCreated();
      } catch (err) {
        setApiError(err instanceof ApiError ? err.message : "No se pudo registrar la promesa");
      }
    }

    return (
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-3 space-y-3 rounded-lg border border-border bg-surface-sunken p-4"
        aria-label="Formulario nueva promesa"
      >
        <div className="grid grid-cols-2 gap-3">
          {/* Monto */}
          <div className="space-y-1">
            <label htmlFor="monto_prometido" className="text-xs font-medium text-text-muted">
              Monto prometido <span className="text-neg">*</span>
            </label>
            <input
              id="monto_prometido"
              type="text"
              inputMode="decimal"
              aria-invalid={Boolean(errors.monto_prometido)}
              className="h-8 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
              {...register("monto_prometido")}
            />
            {errors.monto_prometido && (
              <p role="alert" className="text-xs text-neg">
                {errors.monto_prometido.message}
              </p>
            )}
          </div>

          {/* Fecha */}
          <div className="space-y-1">
            <label htmlFor="fecha_prometida" className="text-xs font-medium text-text-muted">
              Fecha prometida <span className="text-neg">*</span>
            </label>
            <input
              id="fecha_prometida"
              type="date"
              aria-invalid={Boolean(errors.fecha_prometida)}
              className="h-8 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
              {...register("fecha_prometida")}
            />
            {errors.fecha_prometida && (
              <p role="alert" className="text-xs text-neg">
                {errors.fecha_prometida.message}
              </p>
            )}
          </div>
        </div>

        {/* Canal */}
        <div className="space-y-1">
          <label htmlFor="canal_origen" className="text-xs font-medium text-text-muted">
            Canal
          </label>
          <select
            id="canal_origen"
            defaultValue=""
            className="h-8 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
            {...register("canal_origen")}
          >
            <option value="">Sin especificar</option>
            {CANALES_CALL.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {apiError && (
          <p role="alert" className="text-xs text-neg">
            {apiError}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={crear.isPending}>
            {crear.isPending ? "Guardando…" : "Guardar promesa"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { reset(); onCreated(); }}
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  // ─── Panel principal ──────────────────────────────────────────────────────────

  type Props = {
    prestamoId: string;
  };

  export function PromesasPanel({ prestamoId }: Props) {
    const [showForm, setShowForm] = useState(false);
    const { data, isLoading } = usePromesas(prestamoId);

    const promesas = data?.data ?? [];

    if (isLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-sunken" />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-text-subtle">
            Promesas de pago
          </h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
          >
            {showForm ? "Cancelar" : "+ Nueva promesa"}
          </Button>
        </div>

        {showForm && (
          <NuevaPromesaForm
            prestamoId={prestamoId}
            onCreated={() => setShowForm(false)}
          />
        )}

        {promesas.length === 0 && !showForm ? (
          <p className="py-6 text-center text-sm text-text-subtle">Sin promesas registradas</p>
        ) : (
          <ol className="space-y-2" aria-label="Lista de promesas">
            {promesas.map((p) => {
              const { text, bg, border } = estadoColor(p.estado);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <MoneyText
                      value={p.monto_prometido}
                      className="text-sm font-semibold"
                    />
                    <span
                      className="text-xs text-text-muted"
                      style={MONO}
                    >
                      {p.fecha_prometida}
                    </span>
                    {p.canal_origen && (
                      <span className="inline-flex items-center rounded-full border border-border bg-surface-sunken px-1.5 py-px text-[11px] font-medium text-text-muted">
                        {p.canal_origen}
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-px text-[11px] font-medium capitalize ${text} ${bg} ${border}`}
                  >
                    {p.estado}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run the tests to confirm they pass**

  Run from `frontend/`: `npx vitest run src/features/crm/PromesasPanel.test.tsx 2>&1 | tail -30`
  Expected: 3 tests pass.

- [ ] **Step 5: Verify TypeScript compiles**

  Run from `frontend/`: `npx tsc --noEmit 2>&1 | head -30`
  Expected: No errors.

---

## Task 3: Write InteraccionForm tests

**Files:**
- Create: `frontend/src/features/crm/InteraccionForm.test.tsx`

The component already exists at `frontend/src/features/crm/InteraccionForm.tsx`. It accepts `{ personaId, tareaId?, onCreated? }`, uses `useTemas()`, `useCanales()`, `useDisposiciones()`, `useCrearInteraccion()`. The MSW handlers already handle `GET /maestros/temas`, `GET /maestros/canales`, `GET /maestros/disposiciones`, and `POST /interacciones`.

- [ ] **Step 1: Write the failing test**

  Create `frontend/src/features/crm/InteraccionForm.test.tsx`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { screen, waitFor } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { renderWithProviders } from "@/test/utils";
  import { setToken, setSessionUser } from "@/lib/auth";
  import { InteraccionForm } from "./InteraccionForm";

  const onCreated = vi.fn();

  beforeEach(() => {
    setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
    setSessionUser({ email: "op@nexocred.test", nombre: "Op", roles: ["administrativo"] });
    onCreated.mockReset();
  });

  describe("InteraccionForm", () => {
    it("renderiza los selects de disposición, tema y canal usando los catálogos", async () => {
      renderWithProviders(<InteraccionForm personaId="persona-1" onCreated={onCreated} />);

      // disposicion_id es obligatorio y carga del catálogo
      const disposicionSelect = await screen.findByLabelText(/disposición/i);
      expect(disposicionSelect).toBeInTheDocument();
      // temas y canales se muestran si el catálogo tiene items
      // (los fixtures tienen al menos un item activo)
      expect(screen.getByLabelText(/tipo/i)).toBeInTheDocument();
    });

    it("muestra error de validación si se envía sin tipo ni disposición", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InteraccionForm personaId="persona-1" onCreated={onCreated} />);
      await screen.findByLabelText(/disposición/i);

      await user.click(screen.getByRole("button", { name: /registrar interacción/i }));

      await waitFor(() => {
        expect(screen.getByText(/tipo es obligatorio/i)).toBeInTheDocument();
      });
    });

    it("envía el formulario y llama a onCreated al completar exitosamente", async () => {
      const user = userEvent.setup();
      renderWithProviders(<InteraccionForm personaId="persona-1" onCreated={onCreated} />);

      // Seleccionar tipo
      const tipoSelect = await screen.findByLabelText(/tipo/i);
      await user.selectOptions(tipoSelect, "llamada");

      // Seleccionar disposición (primer item disponible del catálogo)
      const disposicionSelect = screen.getByLabelText(/disposición/i);
      const options = Array.from(disposicionSelect.querySelectorAll("option")).filter(
        (o) => o.value !== ""
      );
      if (options.length > 0) {
        await user.selectOptions(disposicionSelect, options[0].value);
      }

      await user.click(screen.getByRole("button", { name: /registrar interacción/i }));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they pass**

  Run from `frontend/`: `npx vitest run src/features/crm/InteraccionForm.test.tsx 2>&1 | tail -30`
  Expected: 3 tests pass.

  If tests fail with "no options available" for disposición, check that `GET /maestros/disposiciones` is handled in MSW. Run: `grep -n "disposicion" frontend/src/mocks/handlers.ts | head -5` to verify. The fixture data is under `fx.disposiciones`.

---

## Task 4: Integrate InteraccionForm into InboxPage

**Files:**
- Modify: `frontend/src/features/crm/InboxPage.tsx`

The goal: add a "+ Nueva interacción" button at the top of InboxPage that opens a modal containing `InteraccionForm`. The form needs a `personaId` — since InboxPage is persona-agnostic (it shows all tareas), provide a "sin persona" escape or require selecting one. Looking at the existing code and spec, the simplest correct approach is to add a modal that takes an optional `personaId` from a text input (or default to empty and let the form handle it per task context). 

Read the top of InboxPage first to find the right insertion point.

- [ ] **Step 1: Read the top of InboxPage to understand the current layout**

  Run: `head -80 frontend/src/features/crm/InboxPage.tsx`

  Key things to find:
  - Where the page header is rendered (the `<header>` or `<h1>` element)
  - What existing imports are there
  - Whether a Dialog/Sheet component is already imported

- [ ] **Step 2: Read the Dialog component to understand its API**

  Run: `cat frontend/src/components/ui/dialog.tsx`

  Note the exported components: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`.

- [ ] **Step 3: Add the modal to InboxPage**

  Read the file carefully first. Then make the following changes:

  **Add to imports at the top** (after the last existing import):
  ```typescript
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
  } from "@/components/ui/dialog";
  import { InteraccionForm } from "./InteraccionForm";
  ```

  **Add state for the modal** (inside the `InboxPage` function, near other `useState` declarations):
  ```typescript
  const [interaccionOpen, setInteraccionOpen] = useState(false);
  const [interaccionPersonaId, setInteraccionPersonaId] = useState("");
  ```

  **Add the button + modal JSX** immediately after the `<header>` element (or at the top of the page content area, before the tab bar). Insert:
  ```tsx
  <div className="flex justify-end">
    <Dialog open={interaccionOpen} onOpenChange={setInteraccionOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          + Nueva interacción
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva interacción</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-2">
          <div className="space-y-1">
            <label htmlFor="inbox-persona-id" className="text-sm font-medium text-text-muted">
              ID de persona (opcional)
            </label>
            <input
              id="inbox-persona-id"
              type="text"
              placeholder="persona-uuid"
              value={interaccionPersonaId}
              onChange={(e) => setInteraccionPersonaId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
            />
          </div>
          {interaccionPersonaId && (
            <InteraccionForm
              personaId={interaccionPersonaId}
              onCreated={() => {
                setInteraccionOpen(false);
                setInteraccionPersonaId("");
              }}
            />
          )}
          {!interaccionPersonaId && (
            <p className="py-4 text-center text-sm text-text-subtle">
              Ingresá el ID de persona para registrar la interacción.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </div>
  ```

  Also verify `Button` is already imported in the file. If not, add:
  ```typescript
  import { Button } from "@/components/ui/button";
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  Run from `frontend/`: `npx tsc --noEmit 2>&1 | head -30`
  Expected: No new errors.

- [ ] **Step 5: Run CRM tests to confirm existing tests still pass**

  Run from `frontend/`: `npx vitest run src/features/crm/crm.test.tsx 2>&1 | tail -20`
  Expected: All 5 tests pass.

---

## Task 5: Integrate PromesasPanel into PrestamoDetailPage

**Files:**
- Modify: `frontend/src/features/prestamos/PrestamoDetailPage.tsx`

- [ ] **Step 1: Read the closing section of PrestamoDetailPage**

  Run: `sed -n '590,605p' frontend/src/features/prestamos/PrestamoDetailPage.tsx`

  Identify the closing structure. The file ends with `</div></div>` at around line 601 (closing the main `<div className="space-y-8">` wrapper).

- [ ] **Step 2: Add the PromesasPanel import**

  In `frontend/src/features/prestamos/PrestamoDetailPage.tsx`, add this import after the existing imports at the top:

  ```typescript
  import { PromesasPanel } from "@/features/crm/PromesasPanel";
  ```

- [ ] **Step 3: Add PromesasPanel section before the closing div**

  Find the closing structure of the main content. The last rendered section before `</div></div>` is the payoff section (around line 567-600). Insert the PromesasPanel after payoff and before the outer closing divs:

  The exact text to find at lines ~597-601:
  ```tsx
          </div>
        )}
      </div>
    </div>
  );
  ```

  Replace it with:
  ```tsx
          </div>
        )}
      </div>

      {/* ─── Promesas de pago ─────────────────────────────────────────────── */}
      <section aria-labelledby="promesas-heading" className="rounded-xl border border-border bg-surface p-5">
        <h2
          id="promesas-heading"
          className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-text-subtle"
        >
          Promesas de pago
        </h2>
        <PromesasPanel prestamoId={id} />
      </section>
    </div>
  );
  ```

  Note: `id` is the route param already destructured from `useParams` at the top of the component.

- [ ] **Step 4: Verify TypeScript compiles**

  Run from `frontend/`: `npx tsc --noEmit 2>&1 | head -30`
  Expected: No errors.

- [ ] **Step 5: Run PromesasPanel tests to confirm integration compiles correctly**

  Run from `frontend/`: `npx vitest run src/features/crm/PromesasPanel.test.tsx 2>&1 | tail -20`
  Expected: 3 tests pass.

---

## Task 6: Final verification — all CRM tests pass

**Files:** (no changes)

- [ ] **Step 1: Run the full CRM test suite**

  Run from `frontend/`: `npx vitest run src/features/crm/ 2>&1 | tail -40`
  Expected: All tests in the crm directory pass. Tests:
  - `crm.test.tsx` (5 tests)
  - `InteraccionForm.test.tsx` (3 tests)
  - `PromesasPanel.test.tsx` (3 tests)
  - `inbox-bandeja.test.tsx` (existing tests)

- [ ] **Step 2: Run TypeScript check on the full frontend**

  Run from `frontend/`: `npx tsc --noEmit 2>&1 | head -40`
  Expected: 0 errors.

- [ ] **Step 3: Run the broader test suite to catch regressions**

  Run from `frontend/`: `npx vitest run src/features/prestamos/ 2>&1 | tail -20`
  Expected: All prestamos tests pass.

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| DashboardFilterBar en RiesgoBoard | Confirmed already done (no task needed) |
| DashboardFilterBar en TorreDashboard | Confirmed already done (no task needed) |
| DashboardFilterBar en TesoreriaDashboard | Confirmed already done (no task needed) |
| DashboardFilterBar en AnalisisCarteraPage | Confirmed already done (no task needed) |
| InteraccionForm con catálogos (temas, canales, disposiciones) | Already implemented; Task 3 adds tests |
| InteraccionForm integrado en InboxPage | Task 4 |
| PromesasPanel con lista + estado coloreado | Task 2 |
| PromesasPanel con formulario nueva promesa | Task 2 (NuevaPromesaForm inside PromesasPanel) |
| usePromesas ya existe | Confirmed (hooks.ts line 127) |
| useCrearPromesa (faltante) | Task 1 |
| PromesasPanel en PrestamoDetailPage | Task 5 |
| Tests InteraccionForm | Task 3 |
| Tests PromesasPanel | Task 2 step 1 |

### Placeholder scan

No placeholders remain — all code blocks are complete.

### Type consistency

- `PromesaIn` defined in Task 1 and used in Task 2 (PromesasPanel → NuevaPromesaForm → useCrearPromesa).
- `PromesaOut` defined in Task 1 and used by `usePromesas` return type (the existing `usePromesas` returns an anonymous inline type; `useCrearPromesa` uses `PromesaOut`).
- `useCrearPromesa()` invalidates `["promesas", vars.prestamo_id]` — matches query key in `usePromesas`: `["promesas", prestamoId, estado]`. The partial key `["promesas", prestamoId]` will still match via TanStack Query prefix invalidation.
- `estadoColor(estado)` in PromesasPanel accepts `string`, matches the `estado: string` field from `usePromesas` data.
- `id` used in Task 5 step 3 comes from `useParams` already in `PrestamoDetailPage`.

All types consistent.
