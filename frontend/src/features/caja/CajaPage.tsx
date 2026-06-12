import { useState } from "react";
import { useCajas, usePosicionConsolidada, useMovimientos } from "@/lib/api/queries";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";

export function CajaPage() {
  const { data: cajasData } = useCajas();
  const { data: posicion } = usePosicionConsolidada();
  const cajas = cajasData?.data ?? [];
  const [cajaId, setCajaId] = useState("caja-1");
  const { data: movData } = useMovimientos(cajaId);
  const movimientos = movData?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Caja</h1>

      <Card>
        <CardTitle>Posición consolidada</CardTitle>
        {posicion && (
          <>
            <p className="mb-3 text-lg font-semibold">
              Total: <MoneyText value={posicion.total} />
            </p>
            <table className="w-full text-sm">
              <tbody>
                {posicion.cajas.map((c) => (
                  <tr key={c.caja_id} className="border-t border-border">
                    <td className="py-1">{c.nombre}</td>
                    <td className="py-1 text-right">
                      <MoneyText value={c.saldo_teorico} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <CardTitle>Ledger (append-only)</CardTitle>
          <select
            aria-label="Seleccionar caja"
            value={cajaId}
            onChange={(e) => setCajaId(e.target.value)}
            className="ml-auto rounded-md border border-border px-2 py-1 text-sm"
          >
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        {movimientos.length === 0 ? (
          <p className="text-sm text-foreground/50">Sin movimientos en esta caja.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-foreground/60">
                <th className="py-1">Fecha</th>
                <th className="py-1">Concepto</th>
                <th className="py-1">Tipo</th>
                <th className="py-1 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-1">{m.fecha_negocio}</td>
                  <td className="py-1">{m.concepto}</td>
                  <td className="py-1">
                    <Badge tone={m.tipo === "ingreso" ? "success" : "warning"}>{m.tipo}</Badge>
                  </td>
                  <td className="py-1 text-right">
                    <MoneyText value={m.monto ?? null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
