import { useState } from "react";
import { useZonas, useSectores } from "@/features/maestros/hooks";
import { MoneyText } from "@/components/MoneyText";
import {
  FILTRO_ZONA_SECTOR_VACIO,
  type FiltroZonaSector,
} from "@/components/filters/DashboardFilterBar";
import { formatMoney } from "@/lib/money";
import { useTablero, useCosechas, useConcentracion } from "./hooks";
import { formatPercent } from "./format";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// ─── Helpers numéricos (sin float sobre money) ───────────────────────────────

/** Cents (BigInt) desde un money string canónico. Tolera basura → 0n. */
function toCentsSafe(value: string | null | undefined): bigint {
  if (value == null) return 0n;
  try {
    return BigInt(formatMoney(value).replace(/\./g, "").replace(",", ""));
  } catch {
    return 0n;
  }
}

/** Ratio 0..1 de `part` sobre `total`, en puntos por mil para precisión sin float. */
function ratioOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  const perMille = Number((part * 1000n) / total);
  return Math.max(0, Math.min(1, perMille / 1000));
}

/** Parse de un porcentaje string ("8.50") a número para comparar umbrales. */
function pctToNumber(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ─── Escala de mora ──────────────────────────────────────────────────────────

type RiskKey = "risk-0" | "risk-30" | "risk-60" | "risk-90" | "risk-castigo";

/** Mapea un nombre de tramo de aging a un peldaño de la escala ordinal. */
function agingRiskKey(tramo: string): RiskKey {
  const t = tramo.toLowerCase();
  if (t.includes("castig") || t.includes("incobr") || t.includes("120") || t.includes("+90")) {
    return "risk-castigo";
  }
  if (t.includes("90")) return "risk-90";
  if (t.includes("60")) return "risk-60";
  if (t.includes("30") || t.includes("1-")) return "risk-30";
  return "risk-0";
}

const RISK_LABEL: Record<RiskKey, string> = {
  "risk-0": "Al día",
  "risk-30": "PAR 30",
  "risk-60": "PAR 60",
  "risk-90": "PAR 90",
  "risk-castigo": "Castigado",
};

// ─── KPI con intención de color sobre EL NÚMERO ──────────────────────────────

type Intent = "pos" | "warn" | "neg" | "neutral";

const INTENT_VAR: Record<Intent, string> = {
  pos: "var(--pos)",
  warn: "var(--warn)",
  neg: "var(--neg)",
  neutral: "var(--text)",
};

/** Umbral → intención. Para PAR: verde sano, amarillo atención, rojo malo. */
function parIntent(value: string | null | undefined, warnAt: number, badAt: number): Intent {
  const n = pctToNumber(value);
  if (n >= badAt) return "neg";
  if (n >= warnAt) return "warn";
  return "pos";
}

function KpiCard({
  label,
  value,
  intent = "neutral",
  href,
  hint,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  intent?: Intent;
  href?: string;
  hint?: string;
  emphasis?: boolean;
}) {
  const body = (
    <div
      className={[
        "group flex h-full flex-col justify-between gap-3 rounded-lg border bg-surface p-4 transition-all duration-150",
        "hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md",
        emphasis ? "border-border-strong shadow-sm" : "border-border",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
          {label}
        </span>
        {intent !== "neutral" && (
          <span
            className="h-1.5 w-1.5 rounded-full transition-transform duration-150 group-hover:scale-125"
            style={{ backgroundColor: INTENT_VAR[intent] }}
            aria-hidden
          />
        )}
      </div>
      <div className="leading-none">
        <div
          className={
            emphasis
              ? "text-3xl font-semibold tracking-tight"
              : "text-2xl font-semibold tracking-tight"
          }
          style={{ ...MONO, color: INTENT_VAR[intent] }}
        >
          {value}
        </div>
        {hint && <div className="mt-1.5 text-xs text-text-muted">{hint}</div>}
      </div>
    </div>
  );

  // Deep-link: cada métrica lleva a la cola que la origina (regla inbox-driven).
  return href ? (
    <a
      href={href}
      className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      {body}
    </a>
  ) : (
    body
  );
}

// ─── Filtro pill-toggle (zona / sector) ──────────────────────────────────────

function PillGroup<T extends { id: string; nombre: string }>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: T[];
  value: string;
  onChange: (id: string) => void;
}) {
  const Pill = ({ id, label }: { id: string; label: string }) => {
    const active = value === id;
    return (
      <button
        type="button"
        onClick={() => onChange(id)}
        aria-pressed={active}
        className={[
          "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
          active
            ? "border-transparent shadow-sm"
            : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text",
        ].join(" ")}
        style={
          active ? { backgroundColor: "var(--brand)", color: "var(--brand-foreground)" } : undefined
        }
      >
        {label}
      </button>
    );
  };

  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{legend}</legend>
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-text-subtle">
        {legend}
      </span>
      <Pill id="" label="Todas" />
      {options.map((o) => (
        <Pill key={o.id} id={o.id} label={o.nombre} />
      ))}
    </fieldset>
  );
}

function FiltroPills({
  filtro,
  onChange,
}: {
  filtro: FiltroZonaSector;
  onChange: (f: FiltroZonaSector) => void;
}) {
  const { data: zonas } = useZonas();
  const { data: sectores } = useSectores();
  const activo = Boolean(filtro.zona_id || filtro.sector_id);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <PillGroup
          legend="Zona"
          options={zonas?.data ?? []}
          value={filtro.zona_id}
          onChange={(zona_id) => onChange({ ...filtro, zona_id })}
        />
        <PillGroup
          legend="Sector"
          options={sectores?.data ?? []}
          value={filtro.sector_id}
          onChange={(sector_id) => onChange({ ...filtro, sector_id })}
        />
      </div>
      {activo && (
        <button
          type="button"
          onClick={() => onChange(FILTRO_ZONA_SECTOR_VACIO)}
          className="self-start rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand-subtle sm:self-auto"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

// ─── Tira de salud (aging stacked health strip) ──────────────────────────────

function AgingHealthStrip({ aging }: { aging: [string, string][] }) {
  const segments = aging
    .map(([tramo, monto]) => ({
      tramo,
      key: agingRiskKey(tramo),
      cents: toCentsSafe(monto),
      monto,
    }))
    .filter((s) => s.cents > 0n);

  const total = segments.reduce((acc, s) => acc + s.cents, 0n);

  if (segments.length === 0 || total <= 0n) {
    return (
      <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-border bg-surface-sunken/40 text-sm text-text-muted">
        Sin saldo en mora para el corte actual.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tira apilada — hero visual */}
      <div
        className="flex h-12 w-full overflow-hidden rounded-lg border border-border shadow-xs"
        role="img"
        aria-label="Distribución de cartera por tramo de mora"
      >
        {segments.map((s) => {
          const pct = ratioOf(s.cents, total);
          if (pct <= 0) return null;
          return (
            <div
              key={s.tramo}
              className="group relative h-full transition-all duration-200 first:rounded-l-lg last:rounded-r-lg hover:brightness-110"
              style={{
                width: `${pct * 100}%`,
                backgroundColor: `hsl(var(--${s.key}))`,
                minWidth: "2px",
              }}
              title={`${RISK_LABEL[s.key]} — ${(pct * 100).toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* Leyenda con monto y share — números en mono */}
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {segments.map((s) => (
          <li key={s.tramo} className="flex items-start gap-2">
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: `hsl(var(--${s.key}))` }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block truncate text-xs text-text-muted">{RISK_LABEL[s.key]}</span>
              <MoneyText value={s.monto} className="text-sm font-medium" />
              <span className="ml-1.5 text-xs text-text-subtle" style={MONO}>
                {(ratioOf(s.cents, total) * 100).toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Panel reutilizable ──────────────────────────────────────────────────────

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-xs">
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

/**
 * Tablero de riesgo: PAR30/60/90, aging, concentración y cosechas. Todo se
 * renderiza desde los mocks contractuales (snapshot-backed), con money en
 * string vía MoneyText y estados explícitos de carga/error.
 */
export function RiesgoBoard() {
  const [filtro, setFiltro] = useState<FiltroZonaSector>(FILTRO_ZONA_SECTOR_VACIO);
  const tableroQ = useTablero(filtro);
  const cosechasQ = useCosechas(filtro);
  const concQ = useConcentracion(filtro);

  if (tableroQ.isLoading) {
    return (
      <div data-testid="riesgo-loading" className="space-y-6">
        <div className="h-7 w-40 animate-pulse rounded bg-surface-sunken" />
        <div className="h-14 w-full animate-pulse rounded-lg bg-surface-sunken" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-sunken" />
          ))}
        </div>
        <div className="h-44 w-full animate-pulse rounded-lg bg-surface-sunken" />
      </div>
    );
  }

  if (tableroQ.isError) {
    return (
      <div
        role="alert"
        className="m-4 flex items-start gap-3 rounded-lg border border-neg-border bg-neg-bg p-4 text-sm"
      >
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-neg" aria-hidden />
        <div>
          <p className="font-medium text-neg">No se pudo cargar el tablero de riesgo.</p>
          <p className="mt-0.5 text-text-muted">Reintentá o ajustá los filtros de zona y sector.</p>
        </div>
      </div>
    );
  }

  const t = tableroQ.data!;
  const aging = Object.entries(t.aging ?? {}) as [string, string][];
  const cosechas = cosechasQ.data?.data ?? [];
  const concentracion = concQ.data?.data ?? [];

  // Concentración: el máximo share define el ancho relativo de las micro-barras.
  const maxShare = concentracion.reduce((m, c) => Math.max(m, pctToNumber(c.share)), 0);

  return (
    <div className="space-y-7 pb-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Riesgo de cartera</h1>
        <p className="text-sm text-text-muted">
          Mora, aging y exposición por grupo — corte vigente, valores en pesos.
        </p>
      </header>

      <FiltroPills filtro={filtro} onChange={setFiltro} />

      {/* KPI grid — el NÚMERO recibe la intención de color */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="PAR 30"
          value={formatPercent(t.par30)}
          intent={parIntent(t.par30, 8, 15)}
          href="/prestamos?estado=en_mora"
          hint="Cartera en riesgo > 30d"
        />
        <KpiCard
          label="PAR 60"
          value={formatPercent(t.par60)}
          intent={parIntent(t.par60, 5, 10)}
          href="/prestamos?estado=en_mora"
          hint="Cartera en riesgo > 60d"
        />
        <KpiCard
          label="PAR 90"
          value={formatPercent(t.par90)}
          intent={parIntent(t.par90, 3, 7)}
          href="/prestamos?estado=en_mora"
          hint="Cartera en riesgo > 90d"
        />
        <KpiCard
          label="Refinanciado"
          value={formatPercent(t.porcentaje_refinanciado)}
          intent={parIntent(t.porcentaje_refinanciado, 12, 25)}
          hint="% sobre cartera total"
        />
        <KpiCard
          label="Pérdida esperada"
          value={<MoneyText value={t.perdida_esperada} className="text-2xl" />}
          intent="neg"
          hint="Provisión proyectada"
        />
        <KpiCard
          label="Cartera total"
          value={<MoneyText value={t.cartera_total} className="text-2xl" />}
          href="/prestamos"
          emphasis
          hint="Saldo bruto vigente"
        />
      </div>

      <Panel title="Aging de cartera" subtitle="Distribución del saldo por tramo de mora.">
        <AgingHealthStrip aging={aging} />
      </Panel>

      <div className="grid gap-7 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel title="Cosechas" subtitle="Mora por mes de originación.">
            {cosechas.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-sm text-text-muted">
                Sin cosechas para el corte actual.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-subtle">
                      <th className="pb-2 font-medium">Mes</th>
                      <th className="pb-2 text-right font-medium">Capital</th>
                      <th className="pb-2 text-right font-medium">Mora</th>
                      <th className="pb-2 text-right font-medium">Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cosechas.map((c) => {
                      const intent = parIntent(c.ratio_mora, 8, 15);
                      return (
                        <tr
                          key={c.mes}
                          className="border-b border-border transition-colors last:border-0 hover:bg-surface-sunken/50"
                        >
                          <td className="py-2 font-medium" style={MONO}>
                            {c.mes}
                          </td>
                          <td className="py-2 text-right">
                            <MoneyText value={c.capital} className="text-sm" />
                          </td>
                          <td className="py-2 text-right">
                            <MoneyText value={c.mora} className="text-sm" />
                          </td>
                          <td className="py-2 text-right">
                            <span
                              style={{ ...MONO, color: INTENT_VAR[intent] }}
                              className="font-medium"
                            >
                              {formatPercent(c.ratio_mora)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-2">
          <Panel title="Concentración" subtitle="Peso de cada grupo en la cartera.">
            {concentracion.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-sm text-text-muted">
                Sin datos de concentración.
              </div>
            ) : (
              <ul className="space-y-3">
                {concentracion.map((c) => {
                  const share = pctToNumber(c.share);
                  // `valor` es el identificador del grupo (producto/zona/vendedor),
                  // NO un monto. El dato de concentración es el `share` (%).
                  const barPct = maxShare > 0 ? share / maxShare : 0;
                  return (
                    <li key={`${c.clave}-${c.valor}`} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-text">
                          <span className="text-text-subtle">{c.clave}:</span>{" "}
                          <span className="font-medium">{c.valor}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold" style={MONO}>
                          {formatPercent(c.share)}
                        </span>
                      </div>
                      {/* Micro-barra inline: ancho = share relativo al máximo */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full transition-[width] duration-300 ease-out"
                          style={{
                            width: `${Math.max(barPct * 100, 2)}%`,
                            backgroundColor: "var(--brand)",
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
