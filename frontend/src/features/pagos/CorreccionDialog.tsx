import { useState } from "react";
import { useCorregirPago } from "@/lib/api/queries";
import { newIdempotencyKey } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { TransactionButton } from "@/components/TransactionButton";

export function CorreccionDialog({
  pagoId,
  open,
  onOpenChange,
}: {
  pagoId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const corregir = useCorregirPago();
  const resultado = corregir.data;
  // Key estable por intento: un retry tras timeout NO debe generar una segunda
  // corrección. Se rota tras éxito.
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Corregir pago">
      <p className="mb-4 text-sm text-text-muted">
        La corrección reversa el pago original con un contra-asiento y registra un pago de reemplazo.
        El asiento original nunca se borra (ledger append-only).
      </p>
      <TransactionButton
        onClick={() =>
          corregir.mutate(
            { pagoId, idempotencyKey: idemKey },
            { onSuccess: () => setIdemKey(newIdempotencyKey()) },
          )
        }
        pending={corregir.isPending}
      >
        {corregir.isPending ? "Corrigiendo…" : "Corregir pago"}
      </TransactionButton>

      {resultado && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-sm font-medium">Corrección registrada</h4>
            <dl className="mt-1 space-y-1 text-sm text-text-muted">
              <div className="flex justify-between gap-4">
                <dt>Pago original</dt>
                <dd className="font-mono">{resultado.pago_original_id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Pago nuevo</dt>
                <dd className="font-mono">{resultado.pago_nuevo_id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Estado original</dt>
                <dd>{resultado.estado_original}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </Dialog>
  );
}
