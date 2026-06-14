import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export type MoneyIntent = "neutral" | "income" | "expense";

const intentClass: Record<MoneyIntent, string> = {
  neutral: "text-text",
  income: "text-pos",
  expense: "text-neg",
};

/**
 * The ONLY sanctioned way to render currency. Always uses money.ts (string,
 * cents-based, no float), mono tabular figures (`font-num`) for column
 * alignment, and an optional `intent` where the SIGN drives the color
 * (income → positive/green, expense → negative/red).
 */
export function MoneyText({
  value,
  withSymbol = true,
  intent = "neutral",
  align = "left",
  className,
}: {
  value: string | null | undefined;
  withSymbol?: boolean;
  intent?: MoneyIntent;
  align?: "left" | "right";
  className?: string;
}) {
  // formatMoney TIRA ante un string no canónico ("", "1.234,56", coma decimal).
  // Sin guard, eso es una pantalla blanca. Caemos a "—" en vez de propagar.
  let formatted: string;
  let valid = false;
  if (value == null) {
    formatted = "—";
  } else {
    try {
      formatted = formatMoney(value);
      valid = true;
    } catch {
      formatted = "—";
    }
  }
  const text = valid && withSymbol ? `$ ${formatted}` : formatted;
  return (
    <span
      className={cn(
        "font-num tabular-nums",
        intentClass[intent],
        align === "right" && "text-right",
        className,
      )}
    >
      {text}
    </span>
  );
}
