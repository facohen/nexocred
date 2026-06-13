import { useState } from "react";
import { useRegistrarPago } from "@/lib/api/queries";
import { newIdempotencyKey } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/MoneyText";
import { CorreccionDialog } from "./CorreccionDialog";
import type { components } from "@/lib/api/schema";

const CONCEPTO_LABEL: Record<string, string> = {
  punitorio: "Punitorio",
  interes: "Interés",
  capital: "Capital",
};

export function RegistrarPagoPage() {
  const [prestamoId, setPrestamoId] = useState("prestamo-1");
  const [monto, setMonto] = useState("");
  const [canal, setCanal] = useState("efectivo");
  const [cajaId, setCajaId] = useState("caja-1");
  // Stable key so retries of the SAME pago reuse it (idempotency).
  // Rotated after each successful submission so a new pago gets a fresh key.
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());
  const [error, setError] = useState<string | null>(null);
  const [correccionPago, setCorreccionPago] = useState<string | null>(null);

  const registrar = useRegistrarPago();
  const resultado = registrar.data;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      prestamo_id: prestamoId,
      monto,
      canal,
      caja_id: cajaId,
    } as unknown as components["schemas"]["PagoCreate"];
    try {
      await registrar.mutateAsync({ body, idempotencyKey: idemKey });
      // Rotate key so the next (different) pago gets a fresh idempotency key.
      setIdemKey(newIdempotencyKey());
    } catch (err) {
      // On error, keep the same key so a retry is safely deduplicated.
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el pago");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Registrar pago</h1>

      <Card>
        <form onSubmit={onSubmit} className="grid grid-cols-4 items-end gap-4">
          <div className="space-y-1">
            <label htmlFor="prestamo" className="text-sm font-medium">
              Préstamo
            </label>
            <Input id="prestamo" value={prestamoId} onChange={(e) => setPrestamoId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="monto" className="text-sm font-medium">
              Monto
            </label>
            <Input id="monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="canal" className="text-sm font-medium">
              Canal
            </label>
            <Input id="canal" value={canal} onChange={(e) => setCanal(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="caja" className="text-sm font-medium">
              Caja
            </label>
            <Input id="caja" value={cajaId} onChange={(e) => setCajaId(e.target.value)} />
          </div>
          <TransactionButton
            type="submit"
            pending={registrar.isPending}
            className="col-span-4 w-fit"
          >
            {registrar.isPending ? "Registrando…" : "Registrar pago"}
          </TransactionButton>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
      </Card>

      {resultado && (
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Imputaciones (waterfall)</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setCorreccionPago(resultado.id)}>
              Corregir
            </Button>
          </div>
          <p className="mb-3 text-sm text-foreground/60">
            Pago <MoneyText value={resultado.monto ?? null} /> · excedente{" "}
            <MoneyText value={resultado.excedente} />
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-foreground/60">
                <th className="py-1">Orden</th>
                <th className="py-1">Concepto</th>
                <th className="py-1">Cuota</th>
                <th className="py-1 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {(resultado.imputaciones ?? []).map((imp) => (
                <tr key={imp.id} className="border-t border-border">
                  <td className="py-1">{imp.orden_waterfall}</td>
                  <td className="py-1">{CONCEPTO_LABEL[imp.concepto ?? ""] ?? imp.concepto}</td>
                  <td className="py-1">{imp.cuota_numero ?? "—"}</td>
                  <td className="py-1 text-right">
                    <MoneyText value={imp.monto ?? null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {correccionPago && (
        <CorreccionDialog
          pagoId={correccionPago}
          open
          onOpenChange={(o) => !o && setCorreccionPago(null)}
        />
      )}
    </div>
  );
}
