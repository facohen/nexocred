import { useTheme } from "@/lib/theme";

/** Toggle light/dark para el header. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-text"
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}
