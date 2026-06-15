import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSolicitudes, usePersonas } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/MoneyText";
import { WorkInboxHero } from "@/components/WorkInbox";
import type { components } from "@/lib/api/schema";

type Solicitud = components["schemas"]["SolicitudOut"];

const ESTADO_TONE: Record<string, "default" | "warning" | "success" | "danger"> = {
  ingresada: "default",
  en_evaluacion: "warning",
  evaluada: "warning",
  aprobada: "success",
  rechazada: "danger",
};

type ClienteCartera = { personaId: string; nombre: string; ultima: Solicitud; total: number };

function idCorto(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * "Mis clientes" del vendedor. El backend scopea el listado de solicitudes al
 * vendedor (GET /solicitudes respeta el rol), así que derivamos la cartera de
 * clientes desde SUS solicitudes — join en el front, sin endpoint agregador.
 *
 * NOTA: GET /personas no acepta vendedor_id, por eso NO se usa el padrón acá;
 * la cartera sale de las solicitudes propias. Cuando el backend soporte filtrar
 * personas por vendedor, esta vista puede simplificarse.
 */
export function MisClientesPage() {
  const navigate = useNavigate();
  const solicitudesQ = useSolicitudes();
  const personasQ = usePersonas();

  const nombrePorPersona = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of personasQ.data?.data ?? []) {
      map.set(p.id, `${p.nombre} ${p.apellido}`.trim());
    }
    return map;
  }, [personasQ.data]);

  const cartera = useMemo(() => {
    const porPersona = new Map<string, ClienteCartera>();
    for (const s of solicitudesQ.data?.data ?? []) {
      const existente = porPersona.get(s.persona_id);
      if (existente) {
        porPersona.set(s.persona_id, { ...existente, total: existente.total + 1 });
      } else {
        porPersona.set(s.persona_id, {
          personaId: s.persona_id,
          nombre: nombrePorPersona.get(s.persona_id) ?? `Cliente ${idCorto(s.persona_id)}`,
          ultima: s,
          total: 1,
        });
      }
    }
    return [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [solicitudesQ.data, nombrePorPersona]);

  if (solicitudesQ.isLoading) {
    return <p className="p-4 text-sm text-text-muted">Cargando…</p>;
  }
  if (solicitudesQ.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudo cargar tu cartera de clientes.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Mis clientes"
        subtitle={`${cartera.length} ${cartera.length === 1 ? "cliente" : "clientes"} en tu cartera`}
        action={
          <button
            type="button"
            onClick={() => navigate({ to: "/originar/nuevo" as string })}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            + Nueva solicitud
          </button>
        }
      />

      {cartera.length === 0 ? (
        <Card>
          <CardTitle>Sin clientes todavía</CardTitle>
          <p className="text-sm text-text-subtle">
            Originá una solicitud para sumar tu primer cliente a la cartera.
          </p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cartera.map((c) => (
            <li key={c.personaId}>
              <button
                type="button"
                onClick={() => navigate({ to: `/personas/${c.personaId}` as string })}
                className="w-full rounded-lg text-left"
              >
                <Card className="space-y-2 transition-colors hover:bg-surface-sunken">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{c.nombre}</CardTitle>
                    <Badge tone={ESTADO_TONE[c.ultima.estado] ?? "default"}>
                      {c.ultima.estado}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm text-text-muted">
                    <span>
                      {c.total} {c.total === 1 ? "solicitud" : "solicitudes"}
                    </span>
                    <span className="font-medium text-text">
                      <MoneyText value={c.ultima.monto ?? null} />
                    </span>
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
