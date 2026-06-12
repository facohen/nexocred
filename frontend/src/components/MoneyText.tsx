import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The ONLY sanctioned way to render currency. Always uses money.ts (string,
 * cents-based, no float) and `tabular-nums` for aligned figures.
 */
export function MoneyText({
  value,
  withSymbol = true,
  className,
}: {
  value: string | null | undefined;
  withSymbol?: boolean;
  className?: string;
}) {
  const formatted = value == null ? "—" : formatMoney(value);
  const text = value != null && withSymbol ? `$ ${formatted}` : formatted;
  return <span className={cn("tabular-nums", className)}>{text}</span>;
}
