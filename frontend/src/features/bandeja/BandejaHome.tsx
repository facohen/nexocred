import { useSession } from "@/lib/auth";
import type { Rol } from "@/lib/auth";
import { Card, CardTitle } from "@/components/ui/card";
import { WorkInboxHero } from "@/components/WorkInbox";

interface AreaTrabajo {
  /** roles que ven esta área */
  roles: Rol[];
  titulo: string;
  descripcion: string;
  to: string;
}

// Hub de entrada multi-rol: cada área enlaza al home de trabajo correspondiente.
const AREAS: AreaTrabajo[] = [
  {
    roles: ["analista"],
    titulo: "Evaluación",
    descripcion: "Cola de solicitudes a evaluar.",
    to: "/evaluacion",
  },
  {
    roles: ["vendedor"],
    titulo: "Pipeline",
    descripcion: "Tus solicitudes en originación.",
    to: "/originar",
  },
  {
    roles: ["operador"],
    titulo: "Tareas",
    descripcion: "Tu inbox de gestiones del día.",
    to: "/crm/inbox",
  },
  {
    roles: ["cobrador"],
    titulo: "Ruta de Cobranza",
    descripcion: "Tus paradas y promesas de pago.",
    to: "/ruta",
  },
  {
    roles: ["tesoreria"],
    titulo: "Tesorería",
    descripcion: "Cajas, conciliación y movimientos.",
    to: "/tesoreria",
  },
  {
    roles: ["admin"],
    titulo: "Tablero Ejecutivo",
    descripcion: "Indicadores y torre de control.",
    to: "/torre",
  },
];

/** Bandeja genérica: hub de entrada con un atajo por cada área relevante al rol. */
export function BandejaHome() {
  const { user } = useSession();
  const roles = user?.roles ?? [];

  const areas = AREAS.filter((a) => a.roles.some((r) => roles.includes(r)));

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Mi bandeja"
        subtitle="Todo lo que tenés que hacer hoy, en un solo lugar."
      />

      {areas.length === 0 ? (
        <p className="text-sm text-text-subtle">
          No hay áreas de trabajo asignadas a tu perfil.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((a) => (
            <a key={a.to} href={a.to} className="block">
              <Card className="h-full transition-colors hover:bg-surface-sunken">
                <CardTitle>{a.titulo}</CardTitle>
                <p className="mt-1 text-sm text-text-muted">{a.descripcion}</p>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
