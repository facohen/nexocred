import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import { formatPercent } from "@/features/riesgo/format";
import { usePosicion, useCashflow, useDcf, useRotacion } from "./hooks";

const SEMAFORO: Record<string, "success" | "warning" | "danger"> = {
  verde: "success",
  amarillo: "warning",
  rojo: "danger",
};

/**
 * Dashboard de Tesorería: posición (con semáforo), cashflow por tramos, DCF por
 * escenario y rotación. Render desde los mocks contractuales; money en string.
 */
export function TesoreriaDashboard() {
  const posQ = usePosicion();
  const cfQ = useCashflow();
  const dcfQ = useDcf();
  const rotQ = useRotacion();

  if (posQ.isLoading) {
    return (
      <div data-testid="tesoreria-loading" className="space-y-2 p-4">
        <div className="h-6 w-1/3 animate-pulse rounded bg-foreground/10" />
        <div className="h-24 w-full animate-pulse rounded bg-foreground/10" />
      </div>
    );
  }
  if (posQ.isError) {
    return (
      <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        No se pudo cargar la posición de tesorería.
      </div>
    );
  }
  const pos = posQ.data!;
  const cashflow = cfQ.data?.tramos ?? [];
  const dcf = dcfQ.data;
  const rot = rotQ.data;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Tesorería</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs text-foreground/60">Capital disponible</div>
          <MoneyText value={pos.capital_disponible} className="text-lg font-semibold" />
        </Card>
        <Card>
          <div className="text-xs text-foreground/60">Capital colocado</div>
          <MoneyText value={pos.capital_colocado} className="text-lg font-semibold" />
        </Card>
        <Card>
          <div className="text-xs text-foreground/60">Utilización</div>
          <div className="text-lg font-semibold tabular-nums">{formatPercent(pos.utilizacion)}</div>
        </Card>
        <Card>
          <div className="text-xs text-foreground/60">Semáforo</div>
          <Badge tone={SEMAFORO[pos.semaforo] ?? "default"}>
            <span data-testid="semaforo">{pos.semaforo}</span>
          </Badge>
        </Card>
      </div>

      <div className="rounded-lg border border-border bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground/80">Cashflow proyectado</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-foreground/60">
              <th className="py-1">Días</th>
              <th className="py-1">Entradas</th>
              <th className="py-1">Egresos</th>
              <th className="py-1">Neto</th>
            </tr>
          </thead>
          <tbody>
            {cashflow.map((tr) => (
              <tr key={tr.dias} className="border-b border-border last:border-0">
                <td className="py-1">{tr.dias}</td>
                <td className="py-1"><MoneyText value={tr.entradas} /></td>
                <td className="py-1"><MoneyText value={tr.egresos} /></td>
                <td className="py-1"><MoneyText value={tr.neto} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground/80">DCF por escenario</h3>
          {dcf ? (
            <ul className="space-y-1 text-sm">
              {dcf.escenarios.map((e) => (
                <li key={e.escenario} className="flex items-center justify-between">
                  <span className="capitalize">{e.escenario} ({formatPercent(e.tasa_mensual)})</span>
                  <MoneyText value={e.valor_presente} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/60">Sin datos.</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground/80">Rotación</h3>
          {rot ? (
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between"><span>Colocación período</span><MoneyText value={rot.colocacion_periodo} /></li>
              <li className="flex justify-between"><span>Capital promedio</span><MoneyText value={rot.capital_promedio} /></li>
              <li className="flex justify-between"><span>Rotación anualizada</span><span className="tabular-nums">{rot.rotacion_anualizada}x</span></li>
            </ul>
          ) : (
            <p className="text-sm text-foreground/60">Sin datos.</p>
          )}
        </div>
      </div>
    </div>
  );
}
