import { useRouterState } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import { areasVisibles } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Tabs horizontales de las vistas internas del área activa. Se muestran solo
 * si el área del path actual tiene más de un tab. Mantiene la jerarquía
 * SECCIÓN → ÁREA → TABS sin aplanar todo en el sidebar.
 */
export function AreaTabs() {
  const { user } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const areas = areasVisibles(user?.roles);

  // El área activa es la que contiene el path (por su `to` o por alguno de sus tabs).
  const area = areas.find(
    (a) =>
      pathname === a.to ||
      pathname.startsWith(a.to + "/") ||
      (a.tabs ?? []).some((t) => pathname === t.to || pathname.startsWith(t.to + "/")),
  );

  if (!area || !area.tabs || area.tabs.length < 2) return null;

  return (
    <div className="flex gap-1 border-b border-border bg-surface px-6">
      {area.tabs.map((tab) => {
        const active = pathname === tab.to || pathname.startsWith(tab.to + "/");
        return (
          <a
            key={tab.to}
            href={tab.to}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors duration-fast",
              active
                ? "border-brand font-medium text-brand"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}
