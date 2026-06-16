// Helpers de analytics. La conversión a número es SOLO para geometría de charts
// e intención de color; el dinero NUNCA se muestra desde estos números (la UI usa
// MoneyText / formatMoneyAr). El backend devuelve MontoStr sin separador de miles
// (ej "1234567.89"), por eso Number() es seguro acá.

export const MAX_LABEL_CHARS = 14;

export function aNumero(monto: string): number {
  const n = Number(monto);
  return Number.isFinite(n) ? n : 0;
}

export function signedIntent(monto: string | undefined): "income" | "expense" | "neutral" {
  if (!monto) return "neutral";
  const n = Number(monto);
  if (n > 0) return "income";
  if (n < 0) return "expense";
  return "neutral";
}

export function pctIsNegative(tasa: string | undefined): boolean {
  return Boolean(tasa) && Number(tasa) < 0;
}

/** Trunca una etiqueta de eje a un largo legible. */
export function truncarEtiqueta(clave: string): string {
  return clave.length > MAX_LABEL_CHARS ? `${clave.slice(0, MAX_LABEL_CHARS - 2)}…` : clave;
}

export type IntentSimple = "pos" | "warn" | "neg";

/**
 * Intención de color para un RATIO de rentabilidad (string del backend, ej
 * "0.0250"). Geometría/semántica de color únicamente — el valor se muestra con
 * formatRatioPercent, nunca desde este número. Umbral: < 0 negativo,
 * 0–`umbralWarn` advertencia, ≥ `umbralWarn` positivo.
 */
export function rentabilidadIntent(ratio: string | undefined, umbralWarn = 0.05): IntentSimple {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n < 0) return "neg";
  if (n < umbralWarn) return "warn";
  return "pos";
}
