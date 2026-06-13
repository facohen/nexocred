import type { Config } from "tailwindcss";

/** hsl(var(--x)) con soporte de opacidad de Tailwind. */
const c = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: {
          DEFAULT: c("surface"),
          sunken: c("surface-sunken"),
        },
        sidebar: {
          DEFAULT: c("sidebar"),
          accent: c("sidebar-accent"),
        },
        text: {
          DEFAULT: c("text"),
          muted: c("text-muted"),
          subtle: c("text-subtle"),
        },
        brand: {
          DEFAULT: c("brand"),
          hover: c("brand-hover"),
          subtle: c("brand-subtle"),
          foreground: c("brand-foreground"),
        },
        border: {
          DEFAULT: c("border"),
          strong: c("border-strong"),
        },
        input: c("input"),
        ring: c("ring"),
        // Semánticos financieros
        pos: { DEFAULT: c("pos"), bg: c("pos-bg"), border: c("pos-border") },
        warn: { DEFAULT: c("warn"), bg: c("warn-bg"), border: c("warn-border") },
        neg: { DEFAULT: c("neg"), bg: c("neg-bg"), border: c("neg-border") },
        info: { DEFAULT: c("info"), bg: c("info-bg"), border: c("info-border") },
        // Escala de mora ordinal
        risk: {
          0: c("risk-0"),
          30: c("risk-30"),
          60: c("risk-60"),
          90: c("risk-90"),
          castigo: c("risk-castigo"),
        },
        // Aliases de compatibilidad con código existente (se migran gradualmente)
        background: c("bg"),
        foreground: c("text"),
        primary: c("brand"),
        muted: c("surface-sunken"),
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
        num: ['"Geist Mono"', '"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "calc(var(--radius) - 2px)",
        DEFAULT: "var(--radius)",
        md: "var(--radius)",
        lg: "calc(var(--radius) + 4px)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        pop: "var(--shadow-pop)",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        DEFAULT: "180ms",
        slow: "240ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
