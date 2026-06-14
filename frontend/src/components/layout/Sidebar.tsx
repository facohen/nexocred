import { useRouterState } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import { areasPorSeccion } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./NavIcon";

/**
 * Navegación principal. Jerarquía visible SECCIÓN → ÁREA: cada sección lleva un
 * encabezado, cada área un ícono SVG coherente y un estado activo marcado (fondo
 * + barra-acento a la izquierda + texto de marca). El pathname es reactivo
 * (useRouterState), de modo que el resaltado sigue a la navegación del router.
 *
 * `mobile` colapsa el ancho fijo a un drawer a pantalla completa (lo gestiona el
 * AppShell); el contenido es el mismo.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useSession();
  const grupos = areasPorSeccion(user?.roles);
  const current = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Navegación principal"
      className="flex h-full w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-sidebar p-3"
    >
      <div className="flex items-center gap-2 px-2 pt-1">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm font-bold text-brand-foreground">
          N
        </span>
        <span className="text-lg font-bold tracking-tight text-text">NexoCred</span>
      </div>

      {grupos.map((grupo) => (
        <div key={grupo.seccion} className="flex flex-col gap-1">
          <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
            {grupo.label}
          </div>
          {grupo.areas.map((area) => {
            const coincide = (to: string) =>
              current === to || current.startsWith(to + "/");
            const isActive =
              coincide(area.to) ||
              (area.tabs ?? []).some((t) => coincide(t.to));
            return (
              <a
                key={area.id}
                href={area.to}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-md py-2 pl-3 pr-2.5 text-sm font-medium transition-colors duration-fast",
                  isActive
                    ? "bg-sidebar-accent text-brand"
                    : "text-text-muted hover:bg-sidebar-accent hover:text-text",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1.5 left-0 w-0.5 rounded-full transition-colors",
                    isActive ? "bg-brand" : "bg-transparent",
                  )}
                />
                <NavIcon
                  name={area.icon}
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    isActive ? "text-brand" : "text-text-subtle group-hover:text-text",
                  )}
                />
                {area.label}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
