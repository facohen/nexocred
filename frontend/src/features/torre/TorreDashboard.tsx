import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import { formatPercent, severidadTone } from "@/features/riesgo/format";
import {
  useResumen,
  usePulso,
  useSaludCartera,
  useOperacionHoy,
  useNegocio,
  useAlertasLive,
} from "./hooks";
import {
  DashboardFilterBar,
  FILTRO_ZONA_SECTOR_VACIO,
  type FiltroZonaSector,
} from "@/components/filters/DashboardFilterBar";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const CLAVES_MONEY = new Set(["cartera", "cobranza_hoy", "colocacion_mes"]);
const CLAVES_PORCENTAJE = new Set(["par30", "par60", "par90"]);

/** Tramos de aging mapeados a la escala de mora ordinal (color con propósito). */
const AGING_TRAMOS: { key: string; label: string; bar: string; text: string }[] = [
  { key: "al_dia", label: "Al día", bar: "bg-risk-0", text: "text-risk-0" },
  { key: "1_30", label: "PAR30", bar: "bg-risk-30", text: "text-risk-30" },
  { key: "31_60", label: "PAR60", bar: "bg-risk-60", text: "text-risk-60" },
  { key: "61_90", label: "PAR90", bar: "bg-risk-90", text: "text-risk-90" },
  { key: "90_mas", label: "Castigo", bar: "bg-risk-castigo", text: "text-risk-castigo" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-text-subtle">
      {children}
    </h2>
  );
}

/** El valor de un KPI: porcentajes en warn-text, money en blanco, conteos en mono. */
function KpiValor({ clave, valor }: { clave: string; valor: string }) {
  if (CLAVES_MONEY.has(clave))
    return <MoneyText value={valor} className="text-2xl font-bold tracking-tight text-text" />;
  if (CLAVES_PORCENTAJE.has(clave))
    return (
      <span style={MONO} className="text-2xl font-bold tracking-tight text-warn">
        {formatPercent(valor)}
      </span>
    );
  return (
    <span style={MONO} className="text-2xl font-bold tracking-tight text-text">
      {valor.replace(".", ",")}
    </span>
  );
}

/** Convierte un string numérico a número finito acotado (para anchos de barra). */
function toNumber(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tablero Ejecutivo — overview de dirección. Encabezado con Índice de Salud como
 * cifra héroe, franja de KPIs accionables, aging como barra de salud apilada, y
 * secciones operativas (hoy / negocio / alertas). Cada métrica drillea a su cola.
 */
export function TorreDashboard() {
  const [filtro, setFiltro] = useState<FiltroZonaSector>(FILTRO_ZONA_SECTOR_VACIO);
  const resumenQ = useResumen(filtro);
  const pulsoQ = usePulso();
  const saludQ = useSaludCartera();
  const opQ = useOperacionHoy();
  const negocioQ = useNegocio();
  const alertasQ = useAlertasLive();

  if (resumenQ.isLoading || pulsoQ.isLoading) {
    return (
      <div data-testid="torre-loading" className="space-y-4">
        <div className="h-20 w-full animate-pulse rounded-xl bg-surface-sunken" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-sunken" />
          ))}
        </div>
        <div className="h-40 w-full animate-pulse rounded-xl bg-surface-sunken" />
      </div>
    );
  }
  if (resumenQ.isError || pulsoQ.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-neg-border bg-neg-bg p-4 text-sm text-neg"
      >
        No se pudo cargar el Tablero Ejecutivo.
      </div>
    );
  }

  const resumen = resumenQ.data!;
  const pulso = pulsoQ.data!;

  if (!resumen.tiene_snapshot || !pulso.tiene_snapshot) {
    return (
      <div className="space-y-4">
        <DashboardFilterBar filtro={filtro} onChange={setFiltro} />
        <h1 className="text-2xl font-bold tracking-tight text-text">Tablero Ejecutivo</h1>
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-sunken p-10 text-center">
          <p className="text-sm font-medium text-text">Aún no hay snapshot de cartera</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
            Ejecutá el job de snapshot (o esperá la corrida nocturna) para ver los indicadores del
            tablero.
          </p>
        </div>
      </div>
    );
  }

  const salud = saludQ.data;
  const op = opQ.data;
  const negocio = negocioQ.data;
  const alertas = alertasQ.data?.alertas ?? [];

  // Total del aging para escalar los segmentos de la barra de salud.
  const agingTotal = salud?.aging
    ? AGING_TRAMOS.reduce(
        (acc, t) => acc + toNumber((salud.aging as Record<string, string>)[t.key]),
        0,
      )
    : 0;

  return (
    <div className="space-y-6">
      <DashboardFilterBar filtro={filtro} onChange={setFiltro} />

      {/* Encabezado con Índice de Salud como cifra héroe */}
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Tablero Ejecutivo</h1>
          {resumen.periodo && (
            <p className="mt-1 text-sm text-text-muted">Período {resumen.periodo}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-text-subtle">
            Índice de Salud
          </div>
          <div
            data-testid="indice-nexo"
            style={MONO}
            className="text-5xl font-bold leading-none tracking-tight text-brand"
          >
            {resumen.indice_nexo.replace(".", ",")}
          </div>
        </div>
      </section>

      {/* Franja de KPIs (Indicadores Clave) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {pulso.tarjetas.map((t) => (
          <a
            key={t.clave}
            data-testid="pulso-card"
            href={CLAVES_PORCENTAJE.has(t.clave) ? "/riesgo/tablero" : "/prestamos"}
            className="group block rounded-xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div className="text-xs text-text-muted">{t.etiqueta}</div>
            <div className="mt-2">
              <KpiValor clave={t.clave} valor={t.valor} />
            </div>
          </a>
        ))}
      </section>

      {/* Salud de cartera: barra de salud apilada + desglose */}
      {salud?.aging && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <SectionLabel>Salud de cartera · aging</SectionLabel>
            {salud.perdida_esperada && (
              <span className="flex items-baseline gap-1.5 text-xs text-text-muted">
                Pérdida esperada
                <MoneyText
                  value={salud.perdida_esperada}
                  intent="expense"
                  className="font-semibold"
                />
              </span>
            )}
          </div>

          {/* Barra de salud: cada tramo proporcional al total */}
          {agingTotal > 0 && (
            <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              {AGING_TRAMOS.map((tramo) => {
                const valor = toNumber((salud.aging as Record<string, string>)[tramo.key]);
                const pct = (valor / agingTotal) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={tramo.key}
                    className={tramo.bar}
                    style={{ width: `${pct}%` }}
                    title={`${tramo.label}: ${pct.toFixed(1)}%`}
                  />
                );
              })}
            </div>
          )}

          {/* Desglose por tramo */}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {AGING_TRAMOS.map((tramo) => {
              const valor = (salud.aging as Record<string, string>)[tramo.key] ?? "0.00";
              return (
                <a
                  key={tramo.key}
                  href="/riesgo/tablero"
                  className="group flex flex-col gap-1 rounded-lg p-1.5 transition-colors hover:bg-surface-sunken"
                >
                  <span className={`flex items-center gap-1.5 text-xs ${tramo.text}`}>
                    <span className={`h-2 w-2 rounded-full ${tramo.bar}`} />
                    {tramo.label}
                  </span>
                  <MoneyText value={valor} className="text-sm font-semibold text-text" />
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Operación del día + Negocio del mes */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <SectionLabel>Operación de hoy</SectionLabel>
          {op ? (
            <ul className="mt-3 divide-y divide-border">
              <li className="flex items-center justify-between py-2.5">
                <a
                  href="/ruta"
                  className="text-sm text-text-muted transition-colors hover:text-text"
                >
                  Cobranza del día
                </a>
                <MoneyText value={op.cobranza_del_dia} intent="income" className="font-semibold" />
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-sm text-text-muted">Cuotas vencen hoy</span>
                <span style={MONO} className="font-semibold text-text">
                  {op.cuotas_vencen_hoy}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <a
                  href="/ruta"
                  className="text-sm text-text-muted transition-colors hover:text-text"
                >
                  Rutas activas
                </a>
                <span style={MONO} className="font-semibold text-text">
                  {op.rutas_activas}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-sm text-text-muted">Promesas pendientes</span>
                <span style={MONO} className="font-semibold text-text">
                  {op.promesas_pendientes}
                </span>
              </li>
              <li className="flex items-center justify-between py-2.5">
                <a
                  href="/solicitudes"
                  className="text-sm text-text-muted transition-colors hover:text-text"
                >
                  Pipeline solicitudes
                </a>
                <span style={MONO} className="font-semibold text-text">
                  {op.pipeline_solicitudes}
                </span>
              </li>
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Sin datos de operación.</p>
          )}
        </article>

        <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <SectionLabel>Negocio del mes</SectionLabel>
          {negocio ? (
            <ul className="mt-3 divide-y divide-border">
              <li className="flex items-center justify-between py-2.5">
                <span className="text-sm text-text-muted">Colocación</span>
                <MoneyText value={negocio.colocacion_mes} className="font-semibold" />
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-sm text-text-muted">Intereses cobrados</span>
                <MoneyText
                  value={negocio.intereses_cobrados_mes}
                  intent="income"
                  className="font-semibold"
                />
              </li>
              <li className="flex items-center justify-between py-2.5">
                <span className="text-sm text-text-muted">Punitorios cobrados</span>
                <MoneyText
                  value={negocio.punitorios_cobrados_mes}
                  intent="income"
                  className="font-semibold"
                />
              </li>
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-muted">Sin datos de negocio.</p>
          )}
        </article>
      </section>

      {/* Alertas Activas con drill-down */}
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <SectionLabel>Alertas Activas</SectionLabel>
          {alertas.length > 0 && (
            <span
              style={MONO}
              className="rounded-full bg-neg-bg px-2 py-0.5 text-xs font-semibold text-neg"
            >
              {alertas.length}
            </span>
          )}
        </div>
        {alertas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-muted">Sin alertas activas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {alertas.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken"
              >
                <a
                  href={`/prestamos/${a.prestamo_id}`}
                  className="min-w-0 truncate text-sm font-medium text-brand underline-offset-2 hover:underline"
                >
                  {a.tipo}
                </a>
                <span className="flex shrink-0 items-center gap-2">
                  {a.severidad && <Badge tone={severidadTone(a.severidad)}>{a.severidad}</Badge>}
                  <span style={MONO} className="text-xs text-text-muted">
                    {a.metrica}: {a.valor}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
