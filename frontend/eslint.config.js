import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist", "dev-dist", "src/lib/api/schema.ts", "node_modules"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Reglas nuevas/experimentales de react-hooks (refs durante render,
      // set-state-in-effect, memoización manual): marcan patrones que el código
      // —incluida la lógica offline de La Ruta— usa a propósito y tiene testeados.
      // Warning, no error, para no romper código probado.
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // El proyecto usa `any` puntual en bordes de tipos generados; warning, no error.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Los tests usan patrones laxos (mocks, casts).
    files: ["**/*.test.{ts,tsx}", "src/mocks/**", "src/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
