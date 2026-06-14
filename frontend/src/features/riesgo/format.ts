/**
 * Format a percentage string (e.g. "8.50") for es-AR display ("8,50 %") WITHOUT
 * float math — we only swap the decimal separator on the string. Percentages
 * are ratios, not currency, but we still avoid parseFloat for consistency.
 */
export function formatPercent(value: string | null | undefined): string {
  if (value == null) return "—";
  return `${value.replace(".", ",")} %`;
}

/**
 * Formatea un RATIO (p.ej. "0.0250" = 2,5 %) como porcentaje es-AR, sin float:
 * corre el punto decimal dos posiciones a la derecha sobre el string. El backend
 * devuelve comisiones/tasas como ratio, no como porcentaje ya escalado.
 */
export function formatRatioPercent(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const neg = value.trim().startsWith("-");
  const unsigned = value.trim().replace(/^[+-]/, "");
  const [intRaw, fracRaw = ""] = unsigned.split(".");
  if (!/^\d*$/.test(intRaw) || !/^\d*$/.test(fracRaw)) return value;
  // Escalar a "centésimas de porcentaje" (4 decimales de ratio → 2 de porcentaje)
  // operando sobre BigInt de los dígitos, sin float.
  const fracPadded = (fracRaw + "0000").slice(0, 4);
  const scaled = BigInt((intRaw || "0") + fracPadded); // ratio * 10_000 = porcentaje * 100
  const intPart = (scaled / 100n).toString();
  const frac = (scaled % 100n).toString().padStart(2, "0");
  return `${neg && scaled !== 0n ? "-" : ""}${intPart},${frac} %`;
}

/**
 * Tone de badge para la severidad de una alerta/incidente. El backend usa
 * `critica`/`alta` → rojo (danger), `media` → amarillo (warning), `baja` →
 * neutro. Antes el componente sólo distinguía "alta", pintando `critica` como
 * warning (sub-representando el riesgo).
 */
export function severidadTone(
  severidad: string | null | undefined,
): "danger" | "warning" | "default" {
  switch (severidad) {
    case "critica":
    case "alta":
      return "danger";
    case "media":
      return "warning";
    default:
      return "default";
  }
}
