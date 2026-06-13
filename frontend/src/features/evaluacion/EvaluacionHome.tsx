import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useSolicitudes, usePersonas } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/MoneyText";
import {
  WorkInbox,
  WorkInboxHero,
  InboxRow,
  type InboxSection,
} from "@/components/WorkInbox";
import type { components } from "@/lib/api/schema";

type Solicitud = components["schemas"]["SolicitudOut"];
type Pago = components["schemas"]["PagoDetalleOut"];

// Estados que requieren acción del analista (entran a la cola de evaluación).
const ESTADOS_A_EVALUAR = ["ingresada", "en_evaluacion", "evaluada"];

const ESTADO_TONE: Record<string, "default" | "warning" | "success" | "danger"> = {
  ingresada: "default",
  en_evaluacion: "warning",
  evaluada: "warning",
  aprobada: "success",
  rechazada: "danger",
};

function idCorto(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Home del ANALISTA: cola priorizada de solicitudes a evaluar + pagos sin aplicar. */
export function EvaluacionHome() {
  const navigate = useNavigate();
  const solicitudesQ = useSolicitudes();
  const personasQ = usePersonas();

  // Pagos "sin aplicar": GET /pagos filtrado por estado distinto de aplicado.
  const pagosQ = usePagos();

  const nombrePorPersona = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of personasQ.data?.data ?? []) {
      map.set(p.id, `${p.nombre} ${p.apellido}`.trim());
    }
    return map;
  }, [personasQ.data]);

  if (solicitudesQ.isLoading) {
    return <p className="p-4 text-sm text-text-muted">Cargando…</p>;
  }
  if (solicitudesQ.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudo cargar la cola de evaluación.
      </p>
    );
  }

  const aEvaluar = (solicitudesQ.data?.data ?? []).filter((s) =>
    ESTADOS_A_EVALUAR.includes(s.estado),
  );
  const pagosSinAplicar = (pagosQ.data?.data ?? []).filter((p) => p.estado !== "aplicado");

  const solicitudSections: InboxSection<Solicitud>[] = [
    {
      title: "Solicitudes a evaluar",
      items: aEvaluar,
      emptyText: "No hay solicitudes esperando evaluación.",
      accent: "warning",
    },
  ];

  const pagoSections: InboxSection<Pago>[] = [
    {
      title: "Pagos sin aplicar",
      items: pagosSinAplicar,
      emptyText: "No hay pagos pendientes de aplicación.",
    },
  ];

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Cola de evaluación"
        subtitle={`${aEvaluar.length} ${
          aEvaluar.length === 1 ? "solicitud esperando" : "solicitudes esperando"
        } evaluación`}
      />

      <WorkInbox
        sections={solicitudSections}
        keyFor={(s) => s.id}
        renderItem={(s) => {
          const nombre = nombrePorPersona.get(s.persona_id);
          return (
            <InboxRow
              title={nombre ?? `Solicitud #${idCorto(s.id)}`}
              context={
                <span>
                  {s.cantidad_cuotas ? `${s.cantidad_cuotas} cuotas · ` : ""}
                  <MoneyText value={s.monto ?? null} />
                </span>
              }
              signals={
                <Badge tone={ESTADO_TONE[s.estado] ?? "default"}>{s.estado}</Badge>
              }
              onClick={() => navigate({ to: `/solicitudes/${s.id}` as string })}
              action={
                <Button
                  size="sm"
                  onClick={() => navigate({ to: `/solicitudes/${s.id}` as string })}
                >
                  Evaluar
                </Button>
              }
            />
          );
        }}
      />

      <WorkInbox
        sections={pagoSections}
        keyFor={(p) => p.id}
        renderItem={(p) => (
          <InboxRow
            title={`Préstamo ${idCorto(p.prestamo_id)}`}
            context={<MoneyText value={p.monto ?? null} />}
            signals={<Badge tone="warning">{p.estado}</Badge>}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate({ to: "/pagos" as string })}
              >
                Aplicar
              </Button>
            }
          />
        )}
      />
    </div>
  );
}

// --- hook local: lista de pagos (GET /pagos). No existe en queries.ts. ---
interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

function usePagos() {
  return useQuery({
    queryKey: ["pagos"],
    queryFn: () => apiFetch<Pagina<Pago>>("/pagos"),
  });
}
