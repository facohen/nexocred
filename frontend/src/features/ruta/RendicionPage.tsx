import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { FormField } from "@/components/FormField";
import { MoneyText } from "@/components/MoneyText";
import { addMoney, compareMoney } from "@/lib/money";
import { ApiError } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { useRendicion, useAgregarDescargo, useCambiarEstadoRendicion } from "./rendicionHooks";

type Descargo = components["schemas"]["DescargoOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

/* ── Coverage model ───────────────────────────────────────────────────────────
 * "Esperado" = lo cobrado + lo descargado (la base que se debe justificar). El
 * coverage es total_cobrado / esperado: cuánto del movimiento del día está
 * respaldado en caja vs. consumido en descargos. Color por intención:
 *   ≥100% pos · ≥80% warn · <80%/<60% neg. */

type Cobertura = "alta" | "media" | "baja";

const COB_VAR: Record<Cobertura, string> = {
  alta: "--pos",
  media: "--warn",
  baja: "--neg",
};

function coberturaFor(pct: number): Cobertura {
  if (pct >= 100) return "alta";
  if (pct >= 80) return "media";
  return "baja";
}

const ESTADO_TONE: Record<string, "default" | "info" | "success" | "warning"> = {
  abierta: "info",
  presentada: "success",
  aprobada: "success",
  rechazada: "warning",
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function ReceiptIcon({ className }: { className?: string }) {
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
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// ─── Coverage gauge (hero) ────────────────────────────────────────────────────

function CoverageGauge({
  cobrado,
  descargos,
  estado,
}: {
  cobrado: string;
  descargos: string;
  estado: string;
}) {
  const { pct, cob, esperado } = useMemo(() => {
    const esperadoStr = addMoney(cobrado, descargos);
    let pctNum = 100;
    // Guard against /0: if nothing is expected, treat as fully covered.
    try {
      if (compareMoney(esperadoStr, "0.00") > 0) {
        // ratio computed on integer pesos to avoid float drift on the bar width
        const c = Number(cobrado.replace(/,/g, ""));
        const e = Number(esperadoStr.replace(/,/g, ""));
        pctNum = e > 0 ? Math.round((c / e) * 100) : 100;
      }
    } catch {
      pctNum = 0;
    }
    return { pct: pctNum, cob: coberturaFor(pctNum), esperado: esperadoStr };
  }, [cobrado, descargos]);

  const cobVar = COB_VAR[cob];
  const barPct = Math.min(pct, 100);

  return (
    <section
      aria-label="Cobertura de la rendición"
      className="overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-sm"
    >
      <div className="relative px-5 pt-5 pb-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ background: `hsl(var(${cobVar}))` }}
          aria-hidden="true"
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-text-subtle">
              Total recaudado
            </span>
            <div className="mt-0.5">
              <MoneyText
                value={cobrado}
                className="text-[2rem] font-bold leading-none tracking-tight"
              />
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              esperado a justificar <MoneyText value={esperado} className="text-text" />
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div
              className="text-3xl font-bold leading-none tracking-tight"
              style={{ color: `hsl(var(${cobVar}))`, ...MONO }}
            >
              {pct}%
            </div>
            <div className="mt-1 text-[0.625rem] uppercase tracking-wide text-text-subtle">
              cobertura
            </div>
          </div>
        </div>
      </div>

      {/* Coverage bar */}
      <div className="border-t border-border px-5 py-3.5">
        <div
          className="h-2.5 w-full overflow-hidden rounded-full"
          style={{ background: "hsl(var(--surface-sunken))" }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${barPct}%`, background: `hsl(var(${cobVar}))` }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[0.6875rem] text-text-subtle">
          <span>
            descargos <MoneyText value={descargos} intent="expense" className="text-xs" />
          </span>
          <Badge tone={ESTADO_TONE[estado] ?? "default"}>{estado}</Badge>
        </div>
      </div>
    </section>
  );
}

// ─── Descargo row ─────────────────────────────────────────────────────────────

function DescargoRow({ descargo }: { descargo: Descargo }) {
  const aprobado = descargo.estado === "aprobado";
  const accent = aprobado ? "--pos" : "--warn";
  return (
    <li className="relative flex items-center gap-3 py-2.5 pl-3">
      <span
        className="absolute inset-y-1.5 left-0 w-0.5 rounded-full"
        style={{ background: `hsl(var(${accent}))` }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">{descargo.concepto}</span>
        <span className="mt-0.5 block text-[0.6875rem]" style={{ color: `hsl(var(${accent}))` }}>
          {aprobado ? "Aprobado" : "Pendiente de aprobación"}
        </span>
      </div>
      <MoneyText
        value={descargo.monto}
        intent="expense"
        className="shrink-0 text-sm font-semibold"
      />
    </li>
  );
}

// ─── Disposición summary (grouped counts) ─────────────────────────────────────

function DisposicionSummary({ descargos }: { descargos: Descargo[] }) {
  const stats = useMemo(() => {
    const aprobados = descargos.filter((d) => d.estado === "aprobado");
    const pendientes = descargos.filter((d) => d.estado !== "aprobado");
    const sum = (xs: Descargo[]) => xs.reduce((acc, d) => addMoney(acc, d.monto ?? "0"), "0");
    return {
      aprobados: { n: aprobados.length, total: sum(aprobados) },
      pendientes: { n: pendientes.length, total: sum(pendientes) },
    };
  }, [descargos]);

  if (descargos.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "hsl(var(--pos))" }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-text-muted">Aprobados</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-text" style={MONO}>
            {stats.aprobados.n}
          </span>
          <MoneyText value={stats.aprobados.total} intent="expense" className="text-xs" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "hsl(var(--warn))" }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-text-muted">Pendientes</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-text" style={MONO}>
            {stats.pendientes.n}
          </span>
          <MoneyText value={stats.pendientes.total} intent="expense" className="text-xs" />
        </div>
      </div>
    </div>
  );
}

/**
 * Cierre de rendición. Muestra total cobrado, descargos y la diferencia
 * (cobrado − descargos aprobados, calculada por el backend), permite agregar
 * descargos y presentar la rendición. Toda la plata es string vía MoneyText.
 */
export function RendicionPage({ rendicionId }: { rendicionId: string }) {
  const q = useRendicion(rendicionId);
  const agregar = useAgregarDescargo(rendicionId);
  const cambiarEstado = useCambiarEstadoRendicion(rendicionId);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4" aria-busy="true" role="status">
        <span className="sr-only">Cargando rendición…</span>
        <div className="h-36 animate-pulse rounded-2xl border border-border bg-surface-sunken" />
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-sunken" />
      </div>
    );
  }
  if (q.isError) {
    const msg = q.error instanceof ApiError ? q.error.message : "Error al cargar la rendición";
    return (
      <div
        role="alert"
        className="mx-auto max-w-2xl rounded-2xl border px-6 py-12 text-center"
        style={{ borderColor: "hsl(var(--neg-border))", background: "hsl(var(--neg-bg))" }}
      >
        <p className="text-base font-semibold" style={{ color: "hsl(var(--neg))" }}>
          No se pudo abrir la rendición
        </p>
        <p className="mt-1 text-sm" style={{ color: "hsl(var(--neg) / 0.75)" }}>
          {msg}
        </p>
      </div>
    );
  }
  const r = q.data!;
  const presentada = r.estado === "presentada";

  async function onAgregar() {
    setAviso(null);
    try {
      await agregar.mutateAsync({ concepto, monto });
      setConcepto("");
      setMonto("");
      setAviso("Descargo registrado.");
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : "No se pudo registrar el descargo.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* ── Header ── */}
      <header className="flex items-end justify-between gap-3 pt-1">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-text"
            style={{ letterSpacing: "-0.02em" }}
          >
            Rendición
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Cierre de caja del{" "}
            <span style={MONO} className="text-text">
              {r.fecha_negocio}
            </span>
          </p>
        </div>
      </header>

      {/* ── Coverage hero ── */}
      <CoverageGauge cobrado={r.total_cobrado} descargos={r.total_descargos} estado={r.estado} />

      {/* ── Diferencia callout ── */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
            Diferencia neta
          </span>
          <p className="mt-0.5 text-xs text-text-muted">cobrado − descargos aprobados</p>
        </div>
        <MoneyText
          value={r.diferencia}
          intent={compareMoney(r.diferencia ?? "0", "0.00") < 0 ? "expense" : "income"}
          className="text-xl font-bold"
        />
      </div>

      {/* ── Disposición summary ── */}
      <DisposicionSummary descargos={r.descargos} />

      {/* ── Descargos breakdown ── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ReceiptIcon className="h-4 w-4 text-text-subtle" />
            <h2 className="text-sm font-semibold text-text">Descargos</h2>
          </div>
          <span className="text-xs text-text-subtle" style={MONO}>
            {r.descargos.length}
          </span>
        </div>

        {r.descargos.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "hsl(var(--surface-sunken))", color: "hsl(var(--text-subtle))" }}
            >
              <ReceiptIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text">Sin descargos cargados</p>
            <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-text-muted">
              Registrá gastos de ruta (combustible, viáticos) para justificar la diferencia de caja.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border px-4">
            {r.descargos.map((d) => (
              <DescargoRow key={d.id} descargo={d} />
            ))}
          </ul>
        )}

        {/* Add descargo form */}
        <div className="border-t border-border bg-surface-sunken px-4 py-3.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <FormField
              label="Concepto"
              name="concepto"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
            <FormField
              label="Monto"
              name="monto"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
            <Button
              onClick={onAgregar}
              disabled={agregar.isPending || !concepto || !monto}
              className="gap-1.5"
            >
              <PlusIcon className="h-4 w-4" />
              Agregar descargo
            </Button>
          </div>
          {aviso && (
            <p
              className="mt-2.5 text-xs"
              style={{
                color: aviso === "Descargo registrado." ? "hsl(var(--pos))" : "hsl(var(--neg))",
              }}
            >
              {aviso}
            </p>
          )}
        </div>
      </section>

      {/* ── Present action ── */}
      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-md">
        <span className="text-xs text-text-muted">
          {presentada
            ? "Enviada al supervisor, a la espera de aprobación."
            : "Revisá los descargos antes de presentar."}
        </span>
        <TransactionButton
          onClick={() => cambiarEstado.mutate("presentada")}
          pending={cambiarEstado.isPending}
          disabled={presentada}
          className="shrink-0"
        >
          {presentada ? "Ya enviada" : "Presentar rendición"}
        </TransactionButton>
      </div>
    </div>
  );
}
