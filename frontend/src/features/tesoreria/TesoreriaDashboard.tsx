import { useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { formatPercent } from "@/features/riesgo/format";
import { usePosicion, useCashflow, useDcf, useRotacion } from "./hooks";
import {
  DashboardFilterBar,
  FILTRO_ZONA_SECTOR_VACIO,
  type FiltroZonaSector,
} from "@/components/filters/DashboardFilterBar";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

/** El semáforo del backend mapea a intención semántica de color. */
const SEMAFORO_INTENT: Record<
  string,
  { text: string; bg: string; border: string; dot: string; label: string }
> = {
  verde: {
    text: "text-pos",
    bg: "bg-pos-bg",
    border: "border-pos-border",
    dot: "bg-pos",
    label: "Holgado",
  },
  amarillo: {
    text: "text-warn",
    bg: "bg-warn-bg",
    border: "border-warn-border",
    dot: "bg-warn",
    label: "Ajustado",
  },
  rojo: {
    text: "text-neg",
    bg: "bg-neg-bg",
    border: "border-neg-border",
    dot: "bg-neg",
    label: "Exigido",
  },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-text-subtle">
      {children}
    </h2>
  );
}

/** Barra de utilización: cuánto del capital está colocado vs disponible. */
function UtilizacionBar({ utilizacion, dot }: { utilizacion: string; dot: string }) {
  const raw = Number(utilizacion);
  const pct = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken" role="presentation">
      <div
        className={`h-full rounded-full ${dot} transition-[width] duration-500 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Dashboard de Tesorería: la posición es el héroe (capital disponible como cifra
 * dominante, con semáforo y barra de utilización), flanqueada por colocado y
 * utilización. Cashflow, DCF y rotación quedan como soporte. Money en string.
 */
export function TesoreriaDashboard() {
  const [filtro, setFiltro] = useState<FiltroZonaSector>(FILTRO_ZONA_SECTOR_VACIO);
  const posQ = usePosicion(filtro);
  const cfQ = useCashflow();
  const dcfQ = useDcf();
  const rotQ = useRotacion();

  if (posQ.isLoading) {
    return (
      <div data-testid="tesoreria-loading" className="space-y-4">
        <div className="h-16 w-full animate-pulse rounded-xl bg-surface-sunken" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-44 animate-pulse rounded-xl bg-surface-sunken lg:col-span-2" />
          <div className="h-44 animate-pulse rounded-xl bg-surface-sunken" />
        </div>
        <div className="h-48 w-full animate-pulse rounded-xl bg-surface-sunken" />
      </div>
    );
  }
  if (posQ.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-neg-border bg-neg-bg p-4 text-sm text-neg"
      >
        No se pudo cargar la posición de tesorería.
      </div>
    );
  }

  const pos = posQ.data!;
  const cashflow = cfQ.data?.tramos ?? [];
  const dcf = dcfQ.data;
  const rot = rotQ.data;
  const sem = SEMAFORO_INTENT[pos.semaforo] ?? SEMAFORO_INTENT.amarillo;

  return (
    <div className="space-y-6">
      <DashboardFilterBar filtro={filtro} onChange={setFiltro} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-text">Tesorería</h1>
        <span
          data-testid="semaforo"
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${sem.border} ${sem.bg} ${sem.text}`}
        >
          <span className={`h-2 w-2 rounded-full ${sem.dot}`} aria-hidden="true" />
          {sem.label}
          <span className="sr-only">{pos.semaforo}</span>
        </span>
      </div>

      {/* Posición — la cifra héroe ocupa 2/3, secundarias a la derecha */}
      <section className="grid gap-4 lg:grid-cols-3">
        <article
          className={`relative overflow-hidden rounded-xl border bg-surface p-6 shadow-sm lg:col-span-2 ${sem.border}`}
        >
          <span className={`absolute inset-y-0 left-0 w-1.5 ${sem.dot}`} aria-hidden="true" />
          <SectionLabel>Capital disponible</SectionLabel>
          <div className="mt-3">
            <MoneyText
              value={pos.capital_disponible}
              className={`block text-4xl font-bold leading-none tracking-tight sm:text-5xl ${sem.text}`}
            />
          </div>
          <div className="mt-6 flex items-center justify-between text-xs text-text-muted">
            <span>Utilización de cartera</span>
            <span style={MONO} className={`font-semibold ${sem.text}`}>
              {formatPercent(pos.utilizacion)}
            </span>
          </div>
          <div className="mt-2">
            <UtilizacionBar utilizacion={pos.utilizacion} dot={sem.dot} />
          </div>
        </article>

        <div className="grid gap-4">
          <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <SectionLabel>Capital colocado</SectionLabel>
            <MoneyText
              value={pos.capital_colocado}
              className="mt-2 block text-2xl font-semibold tracking-tight text-text"
            />
          </article>
          <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <SectionLabel>Utilización</SectionLabel>
            <div style={MONO} className="mt-2 text-2xl font-semibold tabular-nums text-text">
              {formatPercent(pos.utilizacion)}
            </div>
          </article>
        </div>
      </section>

      {/* Cashflow proyectado — tabla con neto coloreado por signo */}
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3">
          <SectionLabel>Cashflow proyectado</SectionLabel>
        </div>
        {cashflow.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-muted">Sin tramos proyectados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-subtle">
                <th className="px-5 py-2 font-medium">Días</th>
                <th className="px-5 py-2 text-right font-medium">Entradas</th>
                <th className="px-5 py-2 text-right font-medium">Egresos</th>
                <th className="px-5 py-2 text-right font-medium">Neto</th>
              </tr>
            </thead>
            <tbody>
              {cashflow.map((tr) => (
                <tr
                  key={tr.dias}
                  className="border-t border-border transition-colors hover:bg-surface-sunken"
                >
                  <td style={MONO} className="px-5 py-2.5 font-medium text-text">
                    {tr.dias}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <MoneyText value={tr.entradas} intent="income" align="right" />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <MoneyText value={tr.egresos} intent="expense" align="right" />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <MoneyText value={tr.neto} align="right" className="font-semibold" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* DCF + Rotación */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <SectionLabel>DCF por escenario</SectionLabel>
          {dcf && dcf.escenarios.length > 0 ? (
            <ul className="mt-3 divide-y divide-border">
              {dcf.escenarios.map((e) => (
                <li key={e.escenario} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm capitalize text-text">{e.escenario}</span>
                    <span style={MONO} className="text-xs text-text-muted">
                      {formatPercent(e.tasa_mensual)}
                    </span>
                  </span>
                  <MoneyText
                    value={e.valor_presente}
                    align="right"
                    className="shrink-0 font-semibold"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Sin escenarios calculados.</p>
          )}
        </article>

        <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <SectionLabel>Rotación</SectionLabel>
          {rot ? (
            <ul className="mt-3 divide-y divide-border">
              <li className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm text-text-muted">Colocación período</span>
                <MoneyText value={rot.colocacion_periodo} align="right" className="font-semibold" />
              </li>
              <li className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm text-text-muted">Capital promedio</span>
                <MoneyText value={rot.capital_promedio} align="right" className="font-semibold" />
              </li>
              <li className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm text-text-muted">Rotación anualizada</span>
                <span style={MONO} className="text-lg font-semibold tabular-nums text-brand">
                  {rot.rotacion_anualizada}
                  <span className="text-sm text-text-muted">x</span>
                </span>
              </li>
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Sin datos de rotación.</p>
          )}
        </article>
      </section>
    </div>
  );
}
