import type { CSSProperties } from "react";

/* ────────────────────────────────────────────────────────────────────────
 * Tokens CRM compartidos. El sistema guarda canales HSL crudos
 * (ej. --neg: "352 75% 47%"), envueltos en hsl(var(--token)).
 * CERO hex/rgb/colores Tailwind palette. Misma paleta que InboxPage.
 * ──────────────────────────────────────────────────────────────────────── */
export const T = {
  brand: "hsl(var(--brand))",
  brandSubtle: "hsl(var(--brand-subtle))",
  brandText: "hsl(var(--brand))",
  brandBorder: "hsl(var(--brand-subtle))",
  surface: "hsl(var(--surface))",
  surfaceSunken: "hsl(var(--surface-sunken))",
  surfacePop: "hsl(var(--surface-sunken))",
  text: "hsl(var(--text))",
  textMuted: "hsl(var(--text-muted))",
  textSubtle: "hsl(var(--text-subtle))",
  border: "hsl(var(--border))",
  borderStrong: "hsl(var(--border-strong))",
  /* pos */
  posBg: "hsl(var(--pos-bg))",
  posText: "hsl(var(--pos))",
  posBorder: "hsl(var(--pos-border))",
  /* neg */
  negText: "hsl(var(--neg))",
  negBg: "hsl(var(--neg-bg))",
  negBorder: "hsl(var(--neg-border))",
  /* warn */
  warnText: "hsl(var(--warn))",
  warnBg: "hsl(var(--warn-bg))",
  warnBorder: "hsl(var(--warn-border))",
  /* info */
  infoText: "hsl(var(--info))",
  infoBg: "hsl(var(--info-bg))",
  infoBorder: "hsl(var(--info-border))",
  /* shadows */
  shadowXs: "var(--shadow-xs)",
  shadowSm: "var(--shadow-sm)",
  shadowPop: "var(--shadow-pop)",
} as const;

export const MONO: CSSProperties = { fontFamily: "'Geist Mono', monospace" };

/** Iniciales tipográficas a partir de un nombre/identificador libre. */
export function iniciales(nombre: string | null | undefined): string {
  const limpio = (nombre ?? "").trim();
  if (!limpio) return "?";
  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
