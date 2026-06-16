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

/**
 * CSS var para el color de texto de cada intención.
 * "neutral" usa --text que sí está definido en index.css (hsl(var(--text))).
 */
const INTENT_COLOR: Record<Intent, string> = {
  pos: "hsl(var(--pos))",
  warn: "hsl(var(--warn))",
  neg: "hsl(var(--neg))",
  neutral: "hsl(var(--text))",
};

/** Color de fondo sutil para el wash de intención en cards. */
const INTENT_BG: Record<Intent, string | null> = {
  pos: null,
  warn: "hsl(var(--warn-bg))",
  neg: "hsl(var(--neg-bg))",
  neutral: null,
};

/** Color del borde izquierdo de acento en cards con riesgo. */
const INTENT_BORDER: Record<Intent, string | null> = {
  pos: null,
  warn: "hsl(var(--warn-border))",
  neg: "hsl(var(--neg-border))",
  neutral: null,
};

/** Umbral → intención. Para PAR: verde sano, amarillo atención, rojo malo. */
function parIntent(value: string | null | undefined, warnAt: number, badAt: number): Intent {
  const n = pctToNumber(value);
  if (n >= badAt) return "neg";
  if (n >= warnAt) return "warn";
  return "pos";
}

/**
 * Color de la micro-barra de concentración según el share de cartera.
 * ≥25% → riesgo negativo, ≥15% → atención, <15% → saludable.
 */
function concentracionBarColor(share: number): string {
  if (share >= 25) return "hsl(var(--neg))";
  if (share >= 15) return "hsl(var(--warn))";
  return "hsl(var(--pos))";
}

// ─── Delta indicator (flecha de dirección para KPIs de PAR) ─────────────────

function DeltaArrow({ intent }: { intent: Intent }) {
  if (intent === "neutral") return null;
  // neg = subiendo mora = flecha arriba = malo. pos = bajando = flecha abajo = bueno.
  const isUp = intent === "neg" || intent === "warn";
  return (
    <span
      className="font-num ml-1 text-xs font-semibold"
      style={{ color: INTENT_COLOR[intent] }}
      aria-hidden
    >
      {isUp ? "↑" : "↓"}
    </span>
  );
}

// ─── KPI Card con acento visual estructural ──────────────────────────────────

function KpiCard({
  label,
  value,
  intent = "neutral",
  href,
  hint,
  emphasis = false,
  showDelta = false,
  colSpan2 = false,
}: {
  label: string;
  value: React.ReactNode;
  intent?: Intent;
  href?: string;
  hint?: string;
  emphasis?: boolean;
  showDelta?: boolean;
  colSpan2?: boolean;
}) {
  const hasAccent = intent === "neg" || intent === "warn";
  const accentBorder = INTENT_BORDER[intent];
  const accentBg = INTENT_BG[intent];

  const body = (
    <div
      className={[
        "group flex h-full flex-col justify-between gap-3 rounded-lg border bg-surface p-4 transition-all duration-150",
        "hover:-translate-y-0.5 hover:shadow-md",
        hasAccent ? "border-border" : emphasis ? "border-border-strong shadow-sm" : "border-border",
        colSpan2 ? "col-span-2" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        // Structural accent: left-border + subtle background wash on risky cards
        borderLeftWidth: hasAccent ? "3px" : emphasis ? "1px" : undefined,
        borderLeftColor: hasAccent && accentBorder ? accentBorder : undefined,
        borderLeftStyle: hasAccent ? "solid" : undefined,
        backgroundColor: hasAccent && accentBg ? accentBg : undefined,
        boxShadow: emphasis && !hasAccent ? "0 0 0 1px hsl(var(--brand) / 0.15)" : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
          {label}
        </span>
        {intent !== "neutral" && (
          <span
            className="h-1.5 w-1.5 rounded-full transition-transform duration-150 group-hover:scale-125"
            style={{ backgroundColor: INTENT_COLOR[intent] }}
            aria-hidden
          />
        )}
      </div>
      <div className="leading-none">
        <div
          className={[
            "font-num flex items-baseline tracking-tight",
            emphasis
              ? "text-3xl font-semibold"
              : colSpan2
                ? "text-2xl font-semibold"
                : "text-2xl font-semibold",
          ].join(" ")}
          style={{ color: INTENT_COLOR[intent] }}
        >
          {value}
          {showDelta && <DeltaArrow intent={intent} />}
        </div>
        {hint && <div className="mt-1.5 text-xs text-text-muted">{hint}</div>}
      </div>
    </div>
  );

  // Deep-link: cada métrica lleva a la cola que la origina (regla inbox-driven).
  return href ? (
    <a
      href={href}
      className={[
        "block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        colSpan2 ? "col-span-2" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
          active
            ? { backgroundColor: "hsl(var(--brand))", color: "hsl(var(--brand-foreground))" }
            : undefined
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
          className="self-start rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-brand-subtle sm:self-auto"
          style={{ color: "hsl(var(--brand))" }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

// ─── Tira de salud (aging stacked health strip) — hero visual ─────────────────

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

  // mora = total de cartera vencida (todo lo que no es risk-0)
  const enMoraCents = segments
    .filter((s) => s.key !== "risk-0")
    .reduce((acc, s) => acc + s.cents, 0n);
  const enMoraPct = ratioOf(enMoraCents, total);

  return (
    <div className="space-y-4">
      {/* Tira apilada — hero visual, h-20 para protagonismo */}
      <div
        className="flex h-20 w-full overflow-hidden rounded-xl border border-border shadow-sm"
        role="img"
        aria-label="Distribución de cartera por tramo de mora"
      >
        {segments.map((s) => {
          const pct = ratioOf(s.cents, total);
          if (pct <= 0) return null;
          const pctDisplay = (pct * 100).toFixed(1);
          const showLabel = pct >= 0.1; // mostrar texto en segmentos ≥10%

          return (
            <div
              key={s.tramo}
              className="group relative flex h-full flex-col items-center justify-center overflow-hidden transition-all duration-200 first:rounded-l-xl last:rounded-r-xl hover:brightness-110"
              style={{
                width: `${pct * 100}%`,
                backgroundColor: `hsl(var(--${s.key}))`,
                minWidth: "2px",
              }}
              title={`${RISK_LABEL[s.key]} — ${pctDisplay}%`}
            >
              {showLabel && (
                <>
                  <span
                    className="font-num pointer-events-none select-none text-sm font-bold drop-shadow-sm"
                    style={{ color: "hsl(var(--surface))" }}
                  >
                    {pctDisplay}%
                  </span>
                  <span
                    className="font-num pointer-events-none select-none text-xs font-medium drop-shadow-sm opacity-80"
                    style={{ color: "hsl(var(--surface))" }}
                  >
                    {RISK_LABEL[s.key]}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Resumen de mora total encima de la leyenda */}
      {enMoraCents > 0n && (
        <div
          className="flex items-center gap-3 rounded-md border px-3 py-2"
          style={{
            borderColor: "hsl(var(--neg-border))",
            backgroundColor: "hsl(var(--neg-bg))",
          }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: "hsl(var(--neg))" }}
            aria-hidden
          />
          <span className="text-xs font-medium" style={{ color: "hsl(var(--neg))" }}>
            En mora total:
          </span>
          <span className="font-num text-xs font-semibold" style={{ color: "hsl(var(--neg))" }}>
            <MoneyText
              value={`${enMoraCents / 100n}.${String(enMoraCents % 100n).padStart(2, "0")}`}
              className="font-num text-xs font-semibold"
            />
          </span>
          <span className="font-num text-xs font-semibold" style={{ color: "hsl(var(--neg))" }}>
            ({(enMoraPct * 100).toFixed(1)}% de cartera)
          </span>
        </div>
      )}

      {/* Leyenda con monto y share — números en font-num */}
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
              <span className="font-num ml-1.5 text-xs text-text-subtle">
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
  accentColor,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <section
      className="rounded-lg border border-border bg-surface p-5 shadow-xs"
      style={accentColor ? { borderTopWidth: "2px", borderTopColor: accentColor } : undefined}
    >
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
        {/* KPI grid skeleton — refleja el layout asimétrico real */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-sunken" />
          ))}
          <div className="col-span-2 h-28 animate-pulse rounded-lg bg-surface-sunken lg:col-span-2" />
        </div>
        <div className="h-56 w-full animate-pulse rounded-lg bg-surface-sunken" />
      </div>
    );
  }

  if (tableroQ.isError) {
    return (
      <div
        role="alert"
        className="m-4 flex items-start gap-3 rounded-lg border p-4 text-sm"
        style={{
          borderColor: "hsl(var(--neg-border))",
          backgroundColor: "hsl(var(--neg-bg))",
        }}
      >
        <span
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: "hsl(var(--neg))" }}
          aria-hidden
        />
        <div>
          <p className="font-medium" style={{ color: "hsl(var(--neg))" }}>
            No se pudo cargar el tablero de riesgo.
          </p>
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

  // Intentos de PAR para estructurar el header resumen
  const par30Intent = parIntent(t.par30, 8, 15);
  const par60Intent = parIntent(t.par60, 5, 10);
  const par90Intent = parIntent(t.par90, 3, 7);

  // Color dominante del header: el peor PAR activo
  const headerRiskIntent =
    par90Intent === "neg" || par60Intent === "neg" || par30Intent === "neg"
      ? "neg"
      : par90Intent === "warn" || par60Intent === "warn" || par30Intent === "warn"
        ? "warn"
        : "pos";

  return (
    <div className="space-y-7 pb-10">
      {/* Header con regla de color que refleja el estado de la cartera */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div
            className="h-7 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: INTENT_COLOR[headerRiskIntent] }}
            aria-hidden
          />
          <h1 className="text-2xl font-bold tracking-tight">Riesgo de cartera</h1>
        </div>
        <p className="pl-4 text-sm text-text-muted">
          Mora, aging y exposición por grupo — corte vigente, valores en pesos.
        </p>
      </header>

      <FiltroPills filtro={filtro} onChange={setFiltro} />

      {/* KPI grid — layout asimétrico: 4 PAR/métricas (1 col cada) + Cartera total (2 cols)
          Fila única en lg: [PAR30][PAR60][PAR90][Refinanciado][PérdidaEsperada][CarteraTotal×2]
          → 4+1+1 = 6 columnas, con CarteraTotal ocupando 2 → total 7, usar grid-cols-7 en lg */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-8">
        {/* PAR cards — con flecha delta y acento estructural en caso de riesgo */}
        <KpiCard
          label="PAR 30"
          value={formatPercent(t.par30)}
          intent={par30Intent}
          href="/prestamos?estado=en_mora"
          hint="vs. mes anterior"
          showDelta
        />
        <KpiCard
          label="PAR 60"
          value={formatPercent(t.par60)}
          intent={par60Intent}
          href="/prestamos?estado=en_mora"
          hint="vs. mes anterior"
          showDelta
        />
        <KpiCard
          label="PAR 90"
          value={formatPercent(t.par90)}
          intent={par90Intent}
          href="/prestamos?estado=en_mora"
          hint="vs. mes anterior"
          showDelta
        />
        <KpiCard
          label="Refinanciado"
          value={formatPercent(t.porcentaje_refinanciado)}
          intent={parIntent(t.porcentaje_refinanciado, 12, 25)}
          hint="% sobre cartera total"
          showDelta
        />
        <KpiCard
          label="Pérdida esperada"
          value={<MoneyText value={t.perdida_esperada} className="font-num text-2xl" />}
          intent="neg"
          hint="Provisión proyectada"
        />
        {/* Cartera total — card protagonista: 3 columnas, tamaño dominante */}
        <div className="col-span-2 sm:col-span-3 lg:col-span-3">
          <a
            href="/prestamos"
            className="block h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <div
              className="group flex h-full flex-col justify-between gap-3 rounded-lg border bg-surface p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
              style={{
                borderColor: "hsl(var(--brand) / 0.4)",
                boxShadow: "0 0 0 1px hsl(var(--brand) / 0.10), 0 1px 3px hsl(var(--brand) / 0.08)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                  Cartera total
                </span>
                <span
                  className="h-1.5 w-1.5 rounded-full transition-transform duration-150 group-hover:scale-125"
                  style={{ backgroundColor: "hsl(var(--brand))" }}
                  aria-hidden
                />
              </div>
              <div className="leading-none">
                <div
                  className="font-num text-3xl font-bold tracking-tight"
                  style={{ color: "hsl(var(--brand))" }}
                >
                  <MoneyText value={t.cartera_total} className="font-num text-3xl font-bold" />
                </div>
                <div className="mt-1.5 text-xs text-text-muted">Saldo bruto vigente</div>
              </div>
            </div>
          </a>
        </div>
      </div>

      {/* Aging — hero panel con acento de color */}
      <Panel
        title="Aging de cartera"
        subtitle="Distribución del saldo por tramo de mora."
        accentColor={`hsl(var(--${
          par90Intent === "neg" ? "risk-90" : par60Intent === "neg" ? "risk-60" : "risk-30"
        }))`}
      >
        <AgingHealthStrip aging={aging} />
      </Panel>

      <div className="grid gap-7 lg:grid-cols-5">
        {/* Cosechas — con fila coloreada por intent */}
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
                      const hasRowAccent = intent === "neg" || intent === "warn";
                      return (
                        <tr
                          key={c.mes}
                          className="border-b border-border transition-colors last:border-0 hover:bg-surface-sunken/50"
                          style={
                            hasRowAccent
                              ? {
                                  borderLeftWidth: "3px",
                                  borderLeftColor: INTENT_COLOR[intent],
                                  borderLeftStyle: "solid",
                                  backgroundColor: `${INTENT_BG[intent]}40`,
                                }
                              : undefined
                          }
                        >
                          <td className={`font-num py-2 font-medium ${hasRowAccent ? "pl-2" : ""}`}>
                            {c.mes}
                          </td>
                          <td className="py-2 text-right">
                            <MoneyText value={c.capital} className="font-num text-sm" />
                          </td>
                          <td className="py-2 text-right">
                            <MoneyText value={c.mora} className="font-num text-sm" />
                          </td>
                          <td className="py-2 text-right">
                            <span
                              className="font-num font-semibold"
                              style={{ color: INTENT_COLOR[intent] }}
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

        {/* Concentración — micro-barras con color semántico */}
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
                  const barColor = concentracionBarColor(share);
                  return (
                    <li key={`${c.clave}-${c.valor}`} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-text">
                          <span className="text-text-subtle">{c.clave}:</span>{" "}
                          <span className="font-medium">{c.valor}</span>
                        </span>
                        <span
                          className="font-num shrink-0 text-sm font-semibold"
                          style={{ color: barColor }}
                        >
                          {formatPercent(c.share)}
                        </span>
                      </div>
                      {/* Micro-barra: h-2 para visibilidad, color = riesgo concentración */}
                      <div
                        className="h-2 w-full overflow-hidden rounded-full"
                        style={{ backgroundColor: "hsl(var(--surface-sunken))" }}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-300 ease-out"
                          style={{
                            width: `${Math.max(barPct * 100, 2)}%`,
                            backgroundColor: barColor,
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
