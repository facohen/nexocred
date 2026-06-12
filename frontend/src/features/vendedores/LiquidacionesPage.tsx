import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { MoneyText } from "@/components/MoneyText";
import {
  useLiquidaciones,
  useGenerarLiquidacion,
  useAprobarLiquidacion,
  usePagarLiquidacion,
} from "./hooks";

/**
 * Liquidaciones de comisiones: generar (período), aprobar (admin) y pagar
 * (Idempotency-Key → egreso de caja). Plata siempre string vía MoneyText.
 */
export function LiquidacionesPage() {
  const q = useLiquidaciones();
  const generar = useGenerarLiquidacion();
  const aprobar = useAprobarLiquidacion();
  const pagar = usePagarLiquidacion();
  const [vendedorId, setVendedorId] = useState("user-vendedor");
  const [desde, setDesde] = useState("2026-06-01");
  const [hasta, setHasta] = useState("2026-06-30");

  if (q.isLoading) return <p className="p-4 text-sm text-foreground/60">Cargando liquidaciones…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-red-700">No se pudieron cargar las liquidaciones.</p>;
  const liquidaciones = q.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Liquidaciones</h1>

      <Card>
        <CardTitle>Generar liquidación</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Vendedor" name="vendedor" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} />
          <FormField label="Desde" name="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <FormField label="Hasta" name="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <Button
            onClick={() => generar.mutate({ vendedor_id: vendedorId, periodo_desde: desde, periodo_hasta: hasta })}
            disabled={generar.isPending}
          >
            Generar
          </Button>
        </div>
      </Card>

      <div className="rounded-lg border border-border bg-white p-4">
        {liquidaciones.length === 0 ? (
          <p className="text-sm text-foreground/60">Sin liquidaciones.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-foreground/60">
                <th className="py-1">Período</th>
                <th className="py-1">Monto</th>
                <th className="py-1">Estado</th>
                <th className="py-1">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {liquidaciones.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="py-1">{l.periodo_desde} → {l.periodo_hasta}</td>
                  <td className="py-1"><MoneyText value={l.monto_total} /></td>
                  <td className="py-1"><Badge tone={l.estado === "pagada" ? "success" : "default"}>{l.estado}</Badge></td>
                  <td className="py-1">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => aprobar.mutate(l.id)} disabled={l.estado !== "borrador"}>
                        Aprobar
                      </Button>
                      <Button size="sm" onClick={() => pagar.mutate(l.id)} disabled={l.estado === "pagada"}>
                        Pagar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
