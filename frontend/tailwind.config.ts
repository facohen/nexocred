import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 32% 91%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222 47% 11%)",
        primary: "hsl(222 47% 11%)",
        muted: "hsl(210 40% 96%)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
