import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import { addMoney } from "@/lib/money";
import { formatRatioPercent } from "@/features/riesgo/format";
import { useComisiones } from "./hooks";

const ESTADOS = ["devengada", "confirmada", "clawback", "liquidada"] as const;

/** Etiquetas visibles al usuario; el estado técnico ("clawback") no se toca. */
const ESTADO_LABEL: Record<string, string> = {
  clawback: "Reversión de Comisión",
};
const labelEstado = (estado: string) => ESTADO_LABEL[estado] ?? estado;

/** Comisiones de un vendedor agrupadas por estado. Plata siempre en string. */
export function ComisionesPage({ vendedorId }: { vendedorId: string }) {
  const q = useComisiones(vendedorId);

  if (q.isLoading) return <p className="p-4 text-sm text-text-muted">Cargando comisiones…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-neg">No se pudieron cargar las comisiones.</p>;

  const comisiones = q.data ?? [];
  // Totales por estado vía suma de strings en centavos (sin float).
  const totales = ESTADOS.map((estado) => {
    const total = comisiones
      .filter((c) => c.estado === estado)
      .reduce((acc, c) => addMoney(acc, c.monto ?? "0.00"), "0.00");
    return { estado, total };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Comisiones</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {totales.map(({ estado, total }) => (
          <Card key={estado}>
            <div className="text-xs capitalize text-text-muted">{labelEstado(estado)}</div>
            <div data-testid={`total-${estado}`} className="text-lg font-semibold">
              <MoneyText value={total} intent={estado === "clawback" ? "expense" : "income"} />
            </div>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-1">Préstamo</th>
              <th className="py-1">Estado</th>
              <th className="py-1">Tipo</th>
              <th className="py-1 text-right">%</th>
              <th className="py-1 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {comisiones.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="py-1">{c.prestamo_id}</td>
                <td className="py-1"><Badge tone={c.estado === "clawback" ? "danger" : "default"}>{labelEstado(c.estado)}</Badge></td>
                <td className="py-1">{c.tipo}</td>
                <td className="py-1 text-right tabular-nums">{formatRatioPercent(c.porcentaje)}</td>
                <td className="py-1 text-right"><MoneyText value={c.monto} intent={c.estado === "clawback" ? "expense" : "income"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
