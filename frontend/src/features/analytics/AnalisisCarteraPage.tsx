import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import { formatMoneyAr } from "@/lib/money";
import { formatRatioPercent } from "@/features/riesgo/format";
import { useResumenAnalytics, useRentabilidad, type DimensionRentabilidad } from "./hooks";
import { useDcf } from "@/features/tesoreria/hooks";
import { CurvaDcf } from "./CurvaDcf";
import type { components } from "@/lib/api/schema";

type RentabilidadItem = components["schemas"]["RentabilidadItem"];

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
  const resumenQ = useResumenAnalytics();
  const rentQ = useRentabilidad(dimension);
  const dcfQ = useDcf();

  const resumen = resumenQ.data;
  const items = rentQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Análisis de cartera</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Rentabilidad ajustada por riesgo, valor presente y líneas/segmentos que crean
            (o destruyen) valor.
          </p>
        </div>
      </header>

      {/* ---- KPIs ---- */}
      {resumenQ.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-neg-border bg-neg-bg p-3 text-sm text-neg"
        >
          No se pudo cargar el resumen de cartera.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Capital colocado">
            <MoneyText value={resumen?.capital_total} className="text-lg font-semibold" />
          </Kpi>
          <Kpi label="Margen neto">
            <MoneyText
              value={resumen?.margen_neto_total}
              intent={signedIntent(resumen?.margen_neto_total)}
              className="text-lg font-semibold"
            />
          </Kpi>
          <Kpi label="Rentabilidad global">
            <span
              className={`text-lg font-semibold tabular-nums ${
                pctIsNegative(resumen?.rentabilidad_global) ? "text-neg" : "text-pos"
              }`}
            >
              {formatRatioPercent(resumen?.rentabilidad_global)}
            </span>
          </Kpi>
          <Kpi label="Pérdida esperada">
            <MoneyText
              value={resumen?.pe_monetaria_total}
              intent="expense"
              className="text-lg font-semibold"
            />
          </Kpi>
        </div>
      )}

      {/* ---- Valor presente / DCF ---- */}
      <Card>
        <CardTitle>Valor presente de la cartera (DCF)</CardTitle>
        {dcfQ.isLoading ? (
          <p className="animate-pulse text-sm text-text-subtle">Calculando valor presente…</p>
        ) : dcfQ.isError || !dcfQ.data ? (
          <p className="text-sm text-text-subtle">Sin datos de valor presente.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6">
              {dcfQ.data.escenarios.map((e) => (
                <div key={e.escenario}>
                  <div className="text-xs capitalize text-text-muted">{e.escenario}</div>
                  <MoneyText value={e.valor_presente} className="text-base font-semibold" />
                  <div className="text-xs text-text-subtle">
                    tasa {formatRatioPercent(e.tasa_mensual)}/mes
                  </div>
                </div>
              ))}
            </div>
            <CurvaDcf curva={dcfQ.data.curva} />
          </div>
        )}
      </Card>

      {/* ---- Rentabilidad por dimensión ---- */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Rentabilidad por dimensión</CardTitle>
          <div className="flex flex-wrap gap-1">
            {DIMENSIONES.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDimension(d.key)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  dimension === d.key
                    ? "border-brand bg-brand-subtle text-brand"
                    : "border-border text-text-muted hover:bg-surface-sunken"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {rentQ.isLoading ? (
          <p className="animate-pulse text-sm text-text-subtle">Cargando rentabilidad…</p>
        ) : rentQ.isError ? (
          <div role="alert" className="text-sm text-neg">
            No se pudo cargar la rentabilidad.
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-subtle">Sin datos para esta dimensión.</p>
        ) : (
          <div className="space-y-4">
            <BarrasMargen items={items} />
            <TablaRentabilidad items={items} dimension={dimension} />
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-text-muted">{label}</div>
      {children}
    </Card>
  );
}

// Conversión SOLO para geometría del gráfico (posición de barras). El dinero NUNCA
// se muestra desde estos números: la UI usa MoneyText/formatMoneyAr con el string.
function aNumero(monto: string): number {
  const n = Number(monto);
  return Number.isFinite(n) ? n : 0;
}

function signedIntent(monto: string | undefined): "income" | "expense" | "neutral" {
  if (!monto) return "neutral";
  const n = Number(monto);
  if (n > 0) return "income";
  if (n < 0) return "expense";
  return "neutral";
}

function pctIsNegative(tasa: string | undefined): boolean {
  return Boolean(tasa) && Number(tasa) < 0;
}

function BarrasMargen({ items }: { items: RentabilidadItem[] }) {
  const data = items.slice(0, 12).map((i) => ({
    clave: i.clave.length > 14 ? `${i.clave.slice(0, 12)}…` : i.clave,
    margen: aNumero(i.margen_neto),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="clave" tick={{ fontSize: 11 }} stroke="hsl(var(--text-muted))" />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--text-muted))"
            tickFormatter={(v) => formatMoneyAr(String(v))}
            width={90}
          />
          <Tooltip
            formatter={(v) => formatMoneyAr(String(v ?? 0))}
            contentStyle={{
              background: "hsl(var(--surface))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="margen" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={d.clave}
                fill={d.margen >= 0 ? "hsl(var(--pos))" : "hsl(var(--neg))"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TablaRentabilidad({
  items,
  dimension,
}: {
  items: RentabilidadItem[];
  dimension: DimensionRentabilidad;
}) {
  const link = DEEPLINK[dimension];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-muted">
            <th className="py-1 pr-2">Clave</th>
            <th className="py-1 pr-2 text-right">Préstamos</th>
            <th className="py-1 pr-2 text-right">Capital</th>
            <th className="py-1 pr-2 text-right">Interés cobrado</th>
            <th className="py-1 pr-2 text-right">Pérdida esp.</th>
            <th className="py-1 pr-2 text-right">Margen neto</th>
            <th className="py-1 text-right">Rent.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const negativo = Number(i.margen_neto) < 0;
            const href = link ? link(i.clave) : undefined;
            return (
              <tr key={i.clave} className="border-b border-border last:border-0">
                <td className="py-1 pr-2">
                  {href ? (
                    <a href={href} className="text-brand hover:underline">
                      {i.clave}
                    </a>
                  ) : (
                    <span className="text-text">{i.clave}</span>
                  )}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{i.n_prestamos}</td>
                <td className="py-1 pr-2 text-right">
                  <MoneyText value={i.capital} align="right" />
                </td>
                <td className="py-1 pr-2 text-right">
                  <MoneyText value={i.interes_cobrado} intent="income" align="right" />
                </td>
                <td className="py-1 pr-2 text-right">
                  <MoneyText value={i.pe_monetaria} intent="expense" align="right" />
                </td>
                <td className="py-1 pr-2 text-right">
                  <MoneyText
                    value={i.margen_neto}
                    intent={negativo ? "expense" : "income"}
                    align="right"
                  />
                </td>
                <td className="py-1 text-right">
                  <Badge tone={negativo ? "danger" : "success"}>
                    {formatRatioPercent(i.rentabilidad_pct)}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
