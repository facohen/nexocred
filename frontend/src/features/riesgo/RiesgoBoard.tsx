import { Card } from "@tremor/react";
import { CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/MoneyText";
import { useTablero, useCosechas, useConcentracion } from "./hooks";
import { formatPercent } from "./format";

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-foreground/60">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

/**
 * Tablero de riesgo: PAR30/60/90, aging, concentración y cosechas. Todo se
 * renderiza desde los mocks contractuales (snapshot-backed), con money en
 * string vía MoneyText y estados explícitos de carga/error.
 */
export function RiesgoBoard() {
  const tableroQ = useTablero();
  const cosechasQ = useCosechas();
  const concQ = useConcentracion();

  if (tableroQ.isLoading) {
    return (
      <div data-testid="riesgo-loading" className="space-y-2 p-4">
        <div className="h-6 w-1/3 animate-pulse rounded bg-foreground/10" />
        <div className="h-24 w-full animate-pulse rounded bg-foreground/10" />
      </div>
    );
  }
  if (tableroQ.isError) {
    return (
      <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        No se pudo cargar el tablero de riesgo.
      </div>
    );
  }
  const t = tableroQ.data!;
  const aging = Object.entries(t.aging ?? {});
  const cosechas = cosechasQ.data?.data ?? [];
  const concentracion = concQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Riesgo</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="PAR30" value={formatPercent(t.par30)} />
        <Kpi label="PAR60" value={formatPercent(t.par60)} />
        <Kpi label="PAR90" value={formatPercent(t.par90)} />
        <Kpi label="Cartera total" value={<MoneyText value={t.cartera_total} />} />
        <Kpi label="% Refinanciado" value={formatPercent(t.porcentaje_refinanciado)} />
        <Kpi label="Pérdida esperada" value={<MoneyText value={t.perdida_esperada} />} />
      </div>

      <div className="rounded-lg border border-border bg-white p-4">
        <CardTitle>Aging de cartera</CardTitle>
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          {aging.map(([tramo, monto]) => (
            <li key={tramo} className="rounded border border-border p-2">
              <div className="text-xs text-foreground/60">{tramo}</div>
              <MoneyText value={String(monto)} className="font-medium" />
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-white p-4">
        <CardTitle>Cosechas</CardTitle>
        {cosechas.length === 0 ? (
          <p className="text-sm text-foreground/60">Sin cosechas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground/60">
                <th className="py-1">Mes</th>
                <th className="py-1">Capital</th>
                <th className="py-1">Mora</th>
                <th className="py-1">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {cosechas.map((c) => (
                <tr key={c.mes} className="border-b border-border last:border-0">
                  <td className="py-1">{c.mes}</td>
                  <td className="py-1"><MoneyText value={c.capital} /></td>
                  <td className="py-1"><MoneyText value={c.mora} /></td>
                  <td className="py-1 tabular-nums">{formatPercent(c.ratio_mora)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-border bg-white p-4">
        <CardTitle>Concentración</CardTitle>
        {concentracion.length === 0 ? (
          <p className="text-sm text-foreground/60">Sin datos de concentración.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {concentracion.map((c) => (
              <li key={c.clave} className="flex items-center justify-between">
                <span>{c.clave}</span>
                <span className="flex gap-3">
                  <MoneyText value={c.valor} />
                  <span className="tabular-nums text-foreground/60">{formatPercent(c.share)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
