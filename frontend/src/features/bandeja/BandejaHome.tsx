import { useNavigate } from "@tanstack/react-router";
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
    roles: ["vendedor"],
    titulo: "Pipeline",
    descripcion: "Tus solicitudes en originación.",
    to: "/originar",
  },
  {
    roles: ["vendedor"],
    titulo: "Mis clientes",
    descripcion: "Tu cartera de clientes.",
    to: "/mis-clientes",
  },
  {
    roles: ["analista_riesgo"],
    titulo: "Evaluación",
    descripcion: "Cola de solicitudes a evaluar y aprobar.",
    to: "/evaluacion",
  },
  {
    roles: ["analista_riesgo", "ceo"],
    titulo: "Riesgo",
    descripcion: "Tablero de cartera y alertas.",
    to: "/riesgo/tablero",
  },
  {
    roles: ["administrativo"],
    titulo: "Cartera",
    descripcion: "Préstamos, pagos, caja y novaciones.",
    to: "/prestamos",
  },
  {
    roles: ["administrativo"],
    titulo: "Ruta de Cobranza",
    descripcion: "Paradas y promesas de pago.",
    to: "/ruta",
  },
  {
    roles: ["vendedor", "administrativo"],
    titulo: "Relación (CRM)",
    descripcion: "Inbox de gestiones e incidentes.",
    to: "/crm/inbox",
  },
  {
    roles: ["administrativo"],
    titulo: "Tesorería",
    descripcion: "Cajas, conciliación y movimientos.",
    to: "/tesoreria",
  },
  {
    roles: ["ceo", "administrativo"],
    titulo: "Tablero Ejecutivo",
    descripcion: "Indicadores y torre de control.",
    to: "/torre",
  },
  {
    roles: ["admin_sistema"],
    titulo: "Usuarios",
    descripcion: "Configuración de usuarios y roles.",
    to: "/usuarios",
  },
];

/** Bandeja genérica: hub de entrada con un atajo por cada área relevante al rol. */
export function BandejaHome() {
  const navigate = useNavigate();
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
        <p className="text-sm text-text-subtle">No hay áreas de trabajo asignadas a tu perfil.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((a) => (
            <button
              key={`${a.to}-${a.titulo}`}
              type="button"
              onClick={() => navigate({ to: a.to as string })}
              className="block text-left"
            >
              <Card className="h-full transition-colors hover:bg-surface-sunken">
                <CardTitle>{a.titulo}</CardTitle>
                <p className="mt-1 text-sm text-text-muted">{a.descripcion}</p>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
