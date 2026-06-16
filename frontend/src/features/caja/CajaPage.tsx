import { useState, type CSSProperties } from "react";
import { useCajas, usePosicionConsolidada, useMovimientos } from "@/lib/api/queries";
import { MoneyText } from "@/components/MoneyText";
import { compareMoney } from "@/lib/money";

const MONO: CSSProperties = { fontFamily: "'Geist Mono', monospace" };

/** Un ingreso suma a la caja (crédito), cualquier otro tipo es egreso (débito). */
function esIngreso(tipo: string | null): boolean {
  return tipo === "ingreso";
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5v.5M12 15v.5M8.5 12h.5M15 12h.5" />
    </svg>
  );
}

// ─── Loading / error / empty primitives ──────────────────────────────────────

function SkeletonLine({ width = "100%", delay = 0 }: { width?: string; delay?: number }) {
  return (
    <div
      className="h-4 animate-pulse rounded-md"
      style={{ width, background: "hsl(var(--surface-sunken))", animationDelay: `${delay}ms` }}
    />
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: "hsl(var(--neg-bg))",
        border: "1px solid hsl(var(--neg-border))",
        color: "hsl(var(--neg))",
      }}
    >
      {children}
    </div>
  );
}

// ─── Posición consolidada — hero balance ──────────────────────────────────────

function PosicionHero({
  total,
  cajas,
  isLoading,
  isError,
}: {
  total?: string;
  cajas: { id: string; nombre: string; saldo_teorico: string }[];
  isLoading: boolean;
  isError: boolean;
}) {
  // Intent del total: positivo (verde) si > 0, negativo (rojo) si < 0.
  let totalIntent: "income" | "expense" | "neutral" = "neutral";
  if (total != null) {
    try {
      const cmp = compareMoney(total, "0.00");
      totalIntent = cmp > 0 ? "income" : cmp < 0 ? "expense" : "neutral";
    } catch {
      totalIntent = "neutral";
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border bg-surface"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {/* Banda de acento marca a la izquierda */}
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: "hsl(var(--brand))" }}
        aria-hidden="true"
      />

      <div className="px-6 py-6 pl-7">
        <div className="flex items-center gap-2 text-text-muted">
          <VaultIcon className="h-4 w-4 text-brand" />
          <span className="text-xs font-semibold uppercase tracking-widest">
            Posición consolidada
          </span>
        </div>

        {isLoading ? (
          <div className="mt-3 space-y-3" data-testid="posicion-loading">
            <SkeletonLine width="40%" />
            <SkeletonLine width="70%" delay={60} />
          </div>
        ) : isError ? (
          <div className="mt-3">
            <ErrorBox>No se pudo cargar la posición consolidada.</ErrorBox>
          </div>
        ) : total != null ? (
          <>
            {/* Balance grande, Geist Mono, color por signo */}
            <p className="mt-2 text-4xl font-bold leading-none tracking-tight">
              <MoneyText value={total} intent={totalIntent} className="text-4xl" />
            </p>
            <p className="mt-1.5 text-xs text-text-subtle">
              Saldo teórico agregado de{" "}
              <span style={MONO} className="text-text-muted">
                {cajas.length}
              </span>{" "}
              {cajas.length === 1 ? "caja" : "cajas"}
            </p>

            {/* Desglose por caja — mini barras de peso */}
            {cajas.length > 0 && (
              <ul className="mt-5 space-y-2.5">
                {cajas.map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-text">{c.nombre}</span>
                    <MoneyText
                      value={c.saldo_teorico}
                      align="right"
                      className="shrink-0 text-sm tabular-nums"
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

// ─── Movimientos ──────────────────────────────────────────────────────────────

function MovimientoRow({
  fecha,
  concepto,
  tipo,
  monto,
}: {
  fecha: string | null;
  concepto: string | null;
  tipo: string | null;
  monto: string | null;
}) {
  const ingreso = esIngreso(tipo);
  const accentVar = ingreso ? "--pos" : "--neg";

  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-sunken">
      {/* Indicador dirección débito/crédito */}
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `hsl(var(${accentVar}) / 0.12)`,
          color: `hsl(var(${accentVar}))`,
          border: `1px solid hsl(var(${accentVar}) / 0.22)`,
        }}
        aria-hidden="true"
      >
        {ingreso ? <ArrowDownIcon className="h-4 w-4" /> : <ArrowUpIcon className="h-4 w-4" />}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-text">
          {concepto || <span className="text-text-subtle">Sin concepto</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-text-subtle">
          <span style={MONO}>{fecha ?? "—"}</span>
          <span
            className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium uppercase tracking-wide"
            style={{
              color: `hsl(var(${accentVar}))`,
              background: `hsl(var(${accentVar}) / 0.1)`,
              letterSpacing: "0.04em",
            }}
          >
            {ingreso ? "crédito" : "débito"}
          </span>
        </span>
      </div>

      {/* Monto — signo dirige el color vía intent */}
      <MoneyText
        value={monto}
        align="right"
        intent={ingreso ? "income" : "expense"}
        className="shrink-0 text-sm font-semibold tabular-nums"
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CajaPage() {
  const cajasQ = useCajas();
  const posicionQ = usePosicionConsolidada();
  const cajas = cajasQ.data?.data ?? [];
  const [cajaIdSel, setCajaId] = useState("");
  // Por defecto la primera caja cargada (antes era un id hardcodeado).
  const cajaId = cajaIdSel || cajas[0]?.id || "";
  const movQ = useMovimientos(cajaId);
  const movimientos = movQ.data?.data ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1
          className="text-3xl font-bold tracking-tight text-text"
          style={{ letterSpacing: "-0.02em" }}
        >
          Caja
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Posición de tesorería y ledger append-only de movimientos.
        </p>
      </header>

      <PosicionHero
        total={posicionQ.data?.total}
        cajas={posicionQ.data?.cajas ?? []}
        isLoading={posicionQ.isLoading}
        isError={posicionQ.isError}
      />

      <section
        className="overflow-hidden rounded-2xl border border-border bg-surface"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text">Ledger</h2>
            <p className="text-xs text-text-subtle">Registro append-only — no se edita ni borra.</p>
          </div>
          {cajasQ.isError ? (
            <span className="ml-auto text-xs" style={{ color: "hsl(var(--neg))" }}>
              No se pudieron cargar las cajas
            </span>
          ) : (
            <select
              aria-label="Seleccionar caja"
              value={cajaId}
              onChange={(e) => setCajaId(e.target.value)}
              disabled={cajasQ.isLoading}
              className="ml-auto rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text transition-colors duration-150 focus:border-brand focus:outline-none disabled:opacity-50"
            >
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        {movQ.isLoading ? (
          <div className="space-y-3 p-4" data-testid="movimientos-loading">
            <SkeletonLine width="33%" />
            <SkeletonLine width="100%" delay={60} />
            <SkeletonLine width="66%" delay={120} />
          </div>
        ) : movQ.isError ? (
          <div className="p-4">
            <ErrorBox>No se pudieron cargar los movimientos de la caja.</ErrorBox>
          </div>
        ) : movimientos.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "hsl(var(--surface-sunken))" }}
            >
              <VaultIcon className="h-6 w-6 text-text-subtle" />
            </div>
            <p className="text-sm font-semibold text-text">Sin movimientos</p>
            <p className="mt-1 max-w-xs text-sm text-text-muted">
              Esta caja todavía no registró ingresos ni egresos.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {movimientos.map((m) => (
              <MovimientoRow
                key={m.id}
                fecha={m.fecha_negocio}
                concepto={m.concepto}
                tipo={m.tipo}
                monto={m.monto ?? null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
