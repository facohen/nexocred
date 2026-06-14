import { Sheet } from "@/components/ui/sheet";
import { PagoForm } from "./PagoForm";

/**
 * Acción contextual: registrar un pago desde cualquier contexto (p.ej. desde la
 * cola de pagos sin aplicar) sin abandonar la pantalla. Reusa PagoForm, por lo
 * que comparte exactamente la misma lógica de idempotencia, EntityCombobox y
 * preview del waterfall que la ruta /pagos.
 */
export function RegistrarPagoSheet({
  open,
  onOpenChange,
  prestamoId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prestamoId?: string;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar pago"
      description="Imputación automática según el orden de waterfall."
    >
      <PagoForm prestamoId={prestamoId} />
    </Sheet>
  );
}
