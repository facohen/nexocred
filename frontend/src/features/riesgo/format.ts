/**
 * Format a percentage string (e.g. "8.50") for es-AR display ("8,50 %") WITHOUT
 * float math — we only swap the decimal separator on the string. Percentages
 * are ratios, not currency, but we still avoid parseFloat for consistency.
 */
export function formatPercent(value: string | null | undefined): string {
  if (value == null) return "—";
  return `${value.replace(".", ",")} %`;
}
