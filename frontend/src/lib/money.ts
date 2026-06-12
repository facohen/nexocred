/**
 * Money is ALWAYS a string. We NEVER apply Number()/parseFloat() to currency.
 * All arithmetic is done on integer cents using BigInt, then re-serialized to
 * a "<int>.<2-decimals>" string. Formatting uses es-AR conventions
 * (thousands separator ".", decimal comma ",").
 */

/** Convert a decimal money string into integer cents (BigInt). */
function toCents(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed.replace(/^\+/, "");
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  // Pad/truncate fractional part to exactly 2 digits (no rounding beyond cents).
  const frac = (fracPartRaw + "00").slice(0, 2);
  if (!/^\d+$/.test(intPart) || !/^\d{2}$/.test(frac)) {
    throw new Error(`Monto invalido: ${value}`);
  }
  const cents = BigInt(intPart) * 100n + BigInt(frac);
  return negative ? -cents : cents;
}

/** Convert integer cents (BigInt) back into a "<int>.<2dec>" string. */
function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const intPart = abs / 100n;
  const frac = abs % 100n;
  const fracStr = frac.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${intPart.toString()}.${fracStr}`;
}

/** Normalize any valid money string to canonical "<int>.<2dec>". */
export function parseMoney(value: string): string {
  return fromCents(toCents(value));
}

export function addMoney(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function subMoney(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

/** -1 if a<b, 0 if equal, 1 if a>b. */
export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const ca = toCents(a);
  const cb = toCents(b);
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  return 0;
}

/** Insert es-AR thousands separators (".") into a plain integer string. */
function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Format a money string for display using es-AR grouping. NO float math. */
export function formatMoney(value: string): string {
  const cents = toCents(value);
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const intPart = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, "0");
  const grouped = groupThousands(intPart);
  return `${negative ? "-" : ""}${grouped},${frac}`;
}

/** Format with the "$" prefix used across the UI. */
export function formatMoneyAr(value: string): string {
  return `$ ${formatMoney(value)}`;
}
