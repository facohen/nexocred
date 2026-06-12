import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TransactionButtonProps extends ButtonProps {
  /** Mutacion en vuelo: deshabilita el boton y muestra spinner para evitar
   * doble submit de una accion que mueve dinero/estado. */
  pending?: boolean;
}

/**
 * Boton para acciones transaccionales (registrar pago, desembolsar, corregir,
 * liquidacion pagar, documento generar, aporte/retiro, sync). Mientras
 * `pending` esta activo, el boton queda deshabilitado + muestra un spinner, de
 * modo que el primer click previene un segundo submit del mismo mutador.
 */
export const TransactionButton = React.forwardRef<
  HTMLButtonElement,
  TransactionButtonProps
>(({ pending = false, disabled, children, className, ...props }, ref) => (
  <Button
    ref={ref}
    aria-busy={pending}
    disabled={pending || disabled}
    className={cn("gap-2", className)}
    {...props}
  >
    {pending && (
      <span
        data-testid="transaction-spinner"
        aria-hidden="true"
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
    )}
    {children}
  </Button>
));
TransactionButton.displayName = "TransactionButton";
