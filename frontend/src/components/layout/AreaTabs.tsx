import { useRouterState } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import { areaActiva } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Tabs horizontales de las vistas internas del área activa. Solo aparecen si el
 * área del path actual tiene 2+ tabs. Estilo pill marcado (fondo de marca en el
 * activo) para que se lea claramente como navegación y no como contenido.
 */
export function AreaTabs() {
  const { user } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activa = areaActiva(pathname, user?.roles);
  const area = activa?.area;

  if (!area || !area.tabs || area.tabs.length < 2) return null;

  return (
    <div className="flex items-center gap-1 border-b border-border bg-surface px-4 sm:px-6">
      {area.tabs.map((tab) => {
        const active = pathname === tab.to || pathname.startsWith(tab.to + "/");
        return (
          <a
            key={tab.to}
            href={tab.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "my-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast",
              active
                ? "bg-brand-subtle text-brand"
                : "text-text-muted hover:bg-surface-sunken hover:text-text",
            )}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}
