import { useSession } from "@/lib/auth";
import { areasPorSeccion } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { user } = useSession();
  const grupos = areasPorSeccion(user?.roles);
  const current = typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <nav
      aria-label="Navegación principal"
      className="flex w-60 flex-col gap-4 overflow-y-auto border-r border-border bg-sidebar p-3"
    >
      <div className="px-2 pt-1 text-lg font-bold text-text">NexoCred</div>

      {grupos.map((grupo) => (
        <div key={grupo.seccion} className="flex flex-col gap-0.5">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
            {grupo.label}
          </div>
          {grupo.areas.map((area) => {
            const active = current === area.to || current.startsWith(area.to + "/");
            // Un área también se marca activa si el path actual es uno de sus tabs.
            const activeTab = (area.tabs ?? []).some(
              (t) => current === t.to || current.startsWith(t.to + "/"),
            );
            const isActive = active || activeTab;
            return (
              <a
                key={area.id}
                href={area.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-text-muted transition-colors duration-fast hover:bg-sidebar-accent hover:text-text",
                  isActive && "bg-sidebar-accent font-medium text-brand",
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {area.icon}
                </span>
                {area.label}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
