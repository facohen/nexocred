import { useState } from "react";
import { useCajas, usePosicionConsolidada, useMovimientos } from "@/lib/api/queries";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";

function Skeleton({ testid }: { testid?: string }) {
  return (
    <div data-testid={testid} className="space-y-2">
      <div className="h-4 w-1/3 animate-pulse rounded bg-surface-sunken" />
      <div className="h-4 w-full animate-pulse rounded bg-surface-sunken" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-sunken" />
    </div>
  );
}

function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-neg-border bg-neg-bg p-3 text-sm text-neg">
      {children}
    </div>
  );
}

export function CajaPage() {
  const cajasQ = useCajas();
  const posicionQ = usePosicionConsolidada();
  const cajas = cajasQ.data?.data ?? [];
  const [cajaIdSel, setCajaId] = useState("");
  // Por defecto la primera caja cargada (antes era un id hardcodeado).
  const cajaId = cajaIdSel || cajas[0]?.id || "";
  const movQ = useMovimientos(cajaId);
  const movimientos = movQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Caja</h1>

      <Card>
        <CardTitle>Posición consolidada</CardTitle>
        {posicionQ.isLoading ? (
          <Skeleton testid="posicion-loading" />
        ) : posicionQ.isError ? (
          <ErrorAlert>No se pudo cargar la posición consolidada.</ErrorAlert>
        ) : posicionQ.data ? (
          <>
            <p className="mb-3 text-lg font-semibold">
              Total: <MoneyText value={posicionQ.data.total} />
            </p>
            <table className="w-full text-sm">
              <tbody>
                {posicionQ.data.cajas.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-1">{c.nombre}</td>
                    <td className="py-1 text-right">
                      <MoneyText value={c.saldo_teorico} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <CardTitle>Ledger (append-only)</CardTitle>
          {cajasQ.isError ? (
            <span className="ml-auto text-sm text-neg">No se pudieron cargar las cajas</span>
          ) : (
            <select
              aria-label="Seleccionar caja"
              value={cajaId}
              onChange={(e) => setCajaId(e.target.value)}
              disabled={cajasQ.isLoading}
              className="ml-auto rounded-md border border-input bg-surface px-2 py-1 text-sm text-text"
            >
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
        {movQ.isLoading ? (
          <Skeleton testid="movimientos-loading" />
        ) : movQ.isError ? (
          <ErrorAlert>No se pudieron cargar los movimientos de la caja.</ErrorAlert>
        ) : movimientos.length === 0 ? (
          <p className="text-sm text-text-subtle">Sin movimientos en esta caja.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted">
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
