import { useCorregirPago } from "@/lib/api/queries";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/MoneyText";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Corregir pago">
      <p className="mb-4 text-sm text-foreground/70">
        La corrección reversa el pago original con un contra-asiento y registra un pago de reemplazo.
        El asiento original nunca se borra (ledger append-only).
      </p>
      <Button
        onClick={() => corregir.mutate({ pagoId })}
        disabled={corregir.isPending}
      >
        {corregir.isPending ? "Corrigiendo…" : "Corregir pago"}
      </Button>

      {resultado && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-sm font-medium">Contra-asiento (reversa)</h4>
            <p className="text-sm text-foreground/70">
              <MoneyText value={resultado.contra_asiento.monto ?? null} /> ·{" "}
              {resultado.contra_asiento.estado}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-sm font-medium">Reemplazo</h4>
            <p className="text-sm text-foreground/70">
              <MoneyText value={resultado.reemplazo.monto ?? null} /> · {resultado.reemplazo.estado}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
