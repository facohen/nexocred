import { useMemo, useState } from "react";
import {
  DashboardFilterBar,
  FILTRO_ZONA_SECTOR_VACIO,
  type FiltroZonaSector,
} from "@/components/filters/DashboardFilterBar";
import { MoneyText } from "@/components/MoneyText";
import { formatRatioPercent } from "@/features/riesgo/format";
import { useResumenAnalytics, useRentabilidad, type DimensionRentabilidad } from "./hooks";
import { useDcf } from "@/features/tesoreria/hooks";
import { CurvaDcf } from "./CurvaDcf";
import {
  aNumero,
  pctIsNegative,
  rentabilidadIntent,
  signedIntent,
  type IntentSimple,
} from "./utils";
import type { components } from "@/lib/api/schema";

type RentabilidadItem = components["schemas"]["RentabilidadItem"];
type ResumenAnalytics = components["schemas"]["ResumenAnalytics"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const INTENT_COLOR: Record<IntentSimple, string> = {
  pos: "hsl(var(--pos))",
  warn: "hsl(var(--warn))",
  neg: "hsl(var(--neg))",
};

const DIMENSIONES: { key: DimensionRentabilidad; label: string }[] = [
  { key: "producto", label: "Línea de crédito" },
  { key: "segmento", label: "Segmento de cliente" },
  { key: "cosecha", label: "Cosecha" },
  { key: "vendedor", label: "Vendedor" },
  { key: "zona", label: "Zona" },
];

// Deep-link inbox-driven: cada dimensión lleva al listado de préstamos filtrado
// por la clave que la origina (cuando el filtro existe en /prestamos).
const DEEPLINK: Partial<Record<DimensionRentabilidad, (clave: string) => string>> = {
  producto: (clave) => `/prestamos?producto_id=${clave}`,
  segmento: (clave) => `/prestamos?persona_id=${clave}`,
};

export function AnalisisCarteraPage() {
  const [dimension, setDimension] = useState<DimensionRentabilidad>("producto");
  const [filtro, setFiltro] = useState<FiltroZonaSector>(FILTRO_ZONA_SECTOR_VACIO);
  const resumenQ = useResumenAnalytics(filtro);
  const rentQ = useRentabilidad(dimension, filtro);
  const dcfQ = useDcf();

  const resumen = resumenQ.data;
  const items = rentQ.data?.data ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
          Analytics · Cartera
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Análisis de cartera</h1>
        <p className="max-w-2xl text-sm text-text-muted">
          Rentabilidad ajustada por riesgo, valor presente y líneas o segmentos que crean —o
          destruyen— valor.
        </p>
      </header>

      <DashboardFilterBar filtro={filtro} onChange={setFiltro} />

      {/* ───── Hero: rentabilidad global dominante + cluster de KPIs ───── */}
      {resumenQ.isError ? (
        <ErrorBanner mensaje="No se pudo cargar el resumen de cartera." />
      ) : (
        <HeroRentabilidad resumen={resumen} loading={resumenQ.isLoading} />
      )}

      {/* ───── Valor presente / DCF ───── */}
      <section className="space-y-3">
        <SectionHeader title="Valor presente · DCF" hint="Materialización del valor en el tiempo" />
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          {dcfQ.isLoading ? (
            <DcfSkeleton />
          ) : dcfQ.isError || !dcfQ.data ? (
            <EmptyPanel mensaje="Sin datos de valor presente." />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
                {dcfQ.data.escenarios.map((e) => (
                  <EscenarioCell
                    key={e.escenario}
                    escenario={e.escenario}
                    valorPresente={e.valor_presente}
                    tasaMensual={e.tasa_mensual}
                  />
                ))}
              </div>
              <CurvaDcf curva={dcfQ.data.curva} />
            </div>
          )}
        </div>
      </section>

      {/* ───── Rentabilidad por dimensión ───── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeader
            title="Rentabilidad por dimensión"
            hint="Margen y retorno por agrupación"
          />
          <DimensionPills value={dimension} onChange={setDimension} />
        </div>

        <div className="rounded-xl border border-border bg-surface shadow-sm">
          {rentQ.isLoading ? (
            <div className="p-5">
              <TablaSkeleton />
            </div>
          ) : rentQ.isError ? (
            <div className="p-5">
              <ErrorBanner mensaje="No se pudo cargar la rentabilidad." />
            </div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyPanel mensaje="Sin datos para esta dimensión." />
            </div>
          ) : (
            <TablaRentabilidad items={items} dimension={dimension} />
          )}
        </div>
      </section>
    </div>
  );
}

// ───────────────────────── Hero ─────────────────────────

function HeroRentabilidad({
  resumen,
  loading,
}: {
  resumen: ResumenAnalytics | undefined;
  loading: boolean;
}) {
  const negativo = pctIsNegative(resumen?.rentabilidad_global);
  const heroColor = negativo ? INTENT_COLOR.neg : INTENT_COLOR.pos;

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Métrica protagonista — ocupa 2/5 */}
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-sm lg:col-span-2"
        style={{
          borderLeftWidth: "3px",
          borderLeftColor: heroColor,
        }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-[0.06] blur-2xl"
          style={{ backgroundColor: heroColor }}
          aria-hidden
        />
        <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
          Rentabilidad global
        </p>
        {loading ? (
          <div className="mt-3 h-12 w-40 animate-pulse rounded-md bg-surface-sunken" />
        ) : (
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className="text-5xl font-semibold leading-none tracking-tight"
              style={{ ...MONO, color: heroColor }}
            >
              {formatRatioPercent(resumen?.rentabilidad_global)}
            </span>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
          <span>
            {resumen?.n_prestamos != null ? (
              <>
                <span className="font-semibold text-text" style={MONO}>
                  {resumen.n_prestamos}
                </span>{" "}
                préstamos
              </>
            ) : (
              "—"
            )}
          </span>
          {resumen?.mejor_producto && (
            <span className="min-w-0 truncate font-medium text-pos">
              ↑ {resumen.mejor_producto}
            </span>
          )}
          {resumen?.peor_producto && (
            <span className="min-w-0 truncate font-medium text-neg">↓ {resumen.peor_producto}</span>
          )}
        </div>
      </div>

      {/* Cluster de KPIs — 3/5, cuadrícula apretada */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm sm:grid-cols-3 lg:col-span-3">
        <KpiCell label="Capital colocado" loading={loading}>
          <MoneyText value={resumen?.capital_total} className="text-xl font-semibold" />
        </KpiCell>
        <KpiCell label="Margen neto" loading={loading}>
          <MoneyText
            value={resumen?.margen_neto_total}
            intent={signedIntent(resumen?.margen_neto_total)}
            className="text-xl font-semibold"
          />
        </KpiCell>
        <KpiCell label="Pérdida esperada" loading={loading}>
          <MoneyText
            value={resumen?.pe_monetaria_total}
            intent="expense"
            className="text-xl font-semibold"
          />
        </KpiCell>
      </div>
    </section>
  );
}

function KpiCell({
  label,
  loading,
  children,
}: {
  label: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 bg-surface p-5 transition-colors duration-150 hover:bg-surface-sunken">
      <span className="text-xs font-medium uppercase tracking-widest text-text-muted">{label}</span>
      {loading ? (
        <div className="h-6 w-24 animate-pulse rounded bg-surface-sunken" />
      ) : (
        <div className="leading-none" style={MONO}>
          {children}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── DCF escenarios ─────────────────────────

function EscenarioCell({
  escenario,
  valorPresente,
  tasaMensual,
}: {
  escenario: string;
  valorPresente: string;
  tasaMensual: string;
}) {
  return (
    <div className="bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-widest capitalize text-text-muted">
        {escenario}
      </div>
      <div className="mt-1.5" style={MONO}>
        <MoneyText value={valorPresente} className="text-lg font-semibold" />
      </div>
      <div className="mt-0.5 text-xs text-text-subtle">
        tasa{" "}
        <span className="font-medium text-text-muted" style={MONO}>
          {formatRatioPercent(tasaMensual)}
        </span>
        /mes
      </div>
    </div>
  );
}

// ───────────────────────── Tabla rentabilidad ─────────────────────────

function TablaRentabilidad({
  items,
  dimension,
}: {
  items: RentabilidadItem[];
  dimension: DimensionRentabilidad;
}) {
  const link = DEEPLINK[dimension];
  const etiqueta = DIMENSIONES.find((d) => d.key === dimension)?.label ?? dimension;

  // Escala compartida para las mini-barras de margen: el máximo |margen| define
  // el 100 % del ancho. Geometría únicamente (no display de dinero).
  const maxMargen = useMemo(
    () => Math.max(1, ...items.map((i) => Math.abs(aNumero(i.margen_neto)))),
    [items],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Rentabilidad por {etiqueta}</caption>
        <thead>
          <tr className="border-b border-border text-text-subtle">
            <Th align="left">Clave</Th>
            <Th align="right">Préstamos</Th>
            <Th align="right">Capital</Th>
            <Th align="right">Interés cobrado</Th>
            <Th align="right">Pérdida esp.</Th>
            <Th align="left">Margen neto</Th>
            <Th align="right">Rent.</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const margenN = aNumero(i.margen_neto);
            const margenNeg = margenN < 0;
            const margenBar = Math.min(1, Math.abs(margenN) / maxMargen);
            const rentInt = rentabilidadIntent(i.rentabilidad_pct);
            const href = link ? link(i.clave) : undefined;
            return (
              <tr
                key={i.clave}
                className="group border-b border-border transition-colors duration-150 last:border-0 hover:bg-surface-sunken"
              >
                <td className="max-w-[14rem] py-2.5 pl-4 pr-2">
                  {href ? (
                    <a
                      href={href}
                      title={i.clave}
                      className="block truncate font-medium text-text outline-none transition-colors hover:text-brand focus-visible:text-brand"
                    >
                      {i.clave}
                    </a>
                  ) : (
                    <span className="block truncate font-medium text-text" title={i.clave}>
                      {i.clave}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-2 text-right text-text-muted" style={MONO}>
                  {i.n_prestamos}
                </td>
                <td className="py-2.5 pr-2 text-right">
                  <MoneyText value={i.capital} align="right" />
                </td>
                <td className="py-2.5 pr-2 text-right">
                  <MoneyText value={i.interes_cobrado} intent="income" align="right" />
                </td>
                <td className="py-2.5 pr-2 text-right">
                  <MoneyText value={i.pe_monetaria} intent="expense" align="right" />
                </td>
                {/* Margen neto con mini-barra inline */}
                <td className="w-44 py-2.5 pr-4">
                  <MiniBarMargen value={i.margen_neto} fraction={margenBar} negative={margenNeg} />
                </td>
                {/* TIR / rentabilidad con barra de progreso semántica */}
                <td className="w-32 py-2.5 pr-4">
                  <RentBar ratio={i.rentabilidad_pct} intent={rentInt} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: "left" | "right" }) {
  return (
    <th
      className={`px-2 py-2 text-xs font-medium uppercase tracking-wide ${
        align === "right" ? "text-right" : "pl-4 text-left"
      }`}
    >
      {children}
    </th>
  );
}

function MiniBarMargen({
  value,
  fraction,
  negative,
}: {
  value: string;
  fraction: number;
  negative: boolean;
}) {
  const color = negative ? INTENT_COLOR.neg : INTENT_COLOR.pos;
  return (
    <div className="flex flex-col items-end gap-1">
      <MoneyText
        value={value}
        intent={negative ? "expense" : "income"}
        align="right"
        className="text-sm font-semibold"
      />
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "hsl(var(--surface-sunken))" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(fraction * 100, 3)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function RentBar({ ratio, intent }: { ratio: string; intent: IntentSimple }) {
  const color = INTENT_COLOR[intent];
  // Geometría: ratio acotado a [0,1] para el ancho de la barra de retorno.
  const n = Number(ratio);
  const frac = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-sm font-semibold" style={{ ...MONO, color }}>
        {formatRatioPercent(ratio)}
      </span>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "hsl(var(--surface-sunken))" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(frac * 100, 3)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ───────────────────────── Pills dimensión ─────────────────────────

function DimensionPills({
  value,
  onChange,
}: {
  value: DimensionRentabilidad;
  onChange: (d: DimensionRentabilidad) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="sr-only">Dimensión de análisis</legend>
      {DIMENSIONES.map((d) => {
        const active = value === d.key;
        return (
          <button
            key={d.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(d.key)}
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
            {d.label}
          </button>
        );
      })}
    </fieldset>
  );
}

// ───────────────────────── Primitivas de estado ─────────────────────────

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-xs font-medium uppercase tracking-widest text-text-muted">{title}</h2>
      {hint && <span className="text-xs text-text-subtle">· {hint}</span>}
    </div>
  );
}

function ErrorBanner({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-neg-border bg-neg-bg px-4 py-3 text-sm font-medium text-neg"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: "hsl(var(--neg))" }}
        aria-hidden
      />
      {mensaje}
    </div>
  );
}

function EmptyPanel({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-surface-sunken text-center">
      <span className="text-sm font-medium text-text-muted">{mensaje}</span>
      <span className="text-xs text-text-subtle">
        Probá quitar los filtros de zona o sector para ampliar el universo.
      </span>
    </div>
  );
}

function DcfSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {[0, 1, 2].map((k) => (
          <div key={k} className="space-y-2 bg-surface p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-surface-sunken" />
            <div className="h-5 w-24 animate-pulse rounded bg-surface-sunken" />
          </div>
        ))}
      </div>
      <div className="h-56 w-full animate-pulse rounded-lg bg-surface-sunken" />
    </div>
  );
}

function TablaSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map((k) => (
        <div key={k} className="flex items-center gap-4">
          <div className="h-4 w-40 animate-pulse rounded bg-surface-sunken" />
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-surface-sunken" />
          <div className="h-4 w-24 animate-pulse rounded bg-surface-sunken" />
          <div className="h-4 w-16 animate-pulse rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  );
}
