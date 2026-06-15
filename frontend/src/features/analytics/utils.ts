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
