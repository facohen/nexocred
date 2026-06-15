import { formatMoneyAr } from "@/lib/money";

// Config compartida de recharts entre los gráficos de analytics. Constantes a
// nivel de módulo: estables entre renders (evita recrear objetos que disparan
// re-render del Tooltip) y única fuente de los estilos con tokens.
export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "hsl(var(--border))",
  vertical: false,
} as const;

export const AXIS_TICK = { fontSize: 11 } as const;
export const AXIS_STROKE = "hsl(var(--text-muted))";

export const TOOLTIP_STYLE = {
  background: "hsl(var(--surface))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;

/** Formatea valores monetarios para ejes/tooltips (geometría, no display de UI). */
export const moneyTickFormatter = (v: unknown): string => formatMoneyAr(String(v ?? 0));
