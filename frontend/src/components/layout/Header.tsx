import { useRouterState } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import { SECCIONES, areaActiva } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Barra superior: hamburguesa (móvil) + breadcrumb de ubicación + buscador ⌘K +
 * identidad y tema. El breadcrumb (Sección › Área › Vista) le dice al usuario
 * dónde está, que era el principal reclamo del navbar anterior.
 */
export function Header({
  onOpenPalette,
  onToggleSidebar,
}: {
  onOpenPalette?: () => void;
  onToggleSidebar?: () => void;
}) {
  const { user, logout } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activa = areaActiva(pathname, user?.roles);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4">
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Abrir navegación"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-sunken lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      <nav aria-label="Ubicación" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        {activa ? (
          <>
            <span className="text-text-subtle">{SECCIONES[activa.area.seccion]}</span>
            <span className="text-text-subtle" aria-hidden>›</span>
            <span className={activa.tab ? "text-text-muted" : "font-medium text-text"}>
              {activa.area.label}
            </span>
            {activa.tab && (
              <>
                <span className="text-text-subtle" aria-hidden>›</span>
                <span className="truncate font-medium text-text">{activa.tab.label}</span>
              </>
            )}
          </>
        ) : (
          <span className="font-medium text-text">NexoCred</span>
        )}
      </nav>

      <button
        type="button"
        onClick={onOpenPalette}
        className="ml-auto flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden sm:inline">Buscar…</span>
        <kbd className="rounded border border-border bg-surface px-1 text-[11px] text-text-subtle">⌘K</kbd>
      </button>

      <div className="flex items-center gap-2">
        {user && (
          <div className="hidden text-right text-sm leading-tight md:block">
            <div className="font-medium text-text">{user.nombre}</div>
            <div className="text-xs capitalize text-text-subtle">{user.roles.join(" · ")}</div>
          </div>
        )}
        <ThemeToggle />
        <Button variant="outline" size="sm" onClick={logout}>
          Salir
        </Button>
      </div>
    </header>
  );
}
