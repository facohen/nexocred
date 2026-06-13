import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Panel lateral deslizante (~480px) para acciones contextuales sin abandonar
 * la página (registrar pago, asignar alerta, ficha rápida). Cierra con Escape
 * o clic en el backdrop. Para confirmaciones irreversibles usar Dialog (modal).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "right",
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: "right" | "left";
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "absolute top-0 flex h-full w-full max-w-[480px] flex-col border-border bg-surface text-text shadow-pop",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
