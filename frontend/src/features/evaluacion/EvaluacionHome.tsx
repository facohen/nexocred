import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { useSolicitudes, usePersonas, useSolicitud } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
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

  // Solicitud seleccionada en la cola (master) → se muestra en el detail.
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

      {/* Split-view master-detail: cola a la izquierda, detalle a la derecha. */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Master (~40%): cola clickeable de solicitudes a evaluar. */}
        <div className="lg:w-2/5">
          <WorkInbox
            sections={solicitudSections}
            keyFor={(s) => s.id}
            renderItem={(s) => {
              const nombre = nombrePorPersona.get(s.persona_id);
              const selected = s.id === selectedId;
              return (
                <InboxRow
                  title={
                    <span className={selected ? "font-semibold" : undefined}>
                      {nombre ?? `Solicitud #${idCorto(s.id)}`}
                    </span>
                  }
                  context={
                    <span>
                      {s.cantidad_cuotas ? `${s.cantidad_cuotas} cuotas · ` : ""}
                      <MoneyText value={s.monto ?? null} />
                    </span>
                  }
                  signals={
                    <Badge tone={ESTADO_TONE[s.estado] ?? "default"}>{s.estado}</Badge>
                  }
                  onClick={() => setSelectedId(s.id)}
                  className={selected ? "bg-surface-sunken ring-1 ring-border" : undefined}
                />
              );
            }}
          />
        </div>

        {/* Detail (~60%): detalle de la solicitud seleccionada. */}
        <div className="lg:w-3/5">
          <SolicitudDetail
            solicitudId={selectedId}
            nombrePorPersona={nombrePorPersona}
            onAbrir={(id) => navigate({ to: `/solicitudes/${id}` as string })}
          />
        </div>
      </div>

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

/** Panel detalle del split-view: muestra la solicitud seleccionada de la cola. */
function SolicitudDetail({
  solicitudId,
  nombrePorPersona,
  onAbrir,
}: {
  solicitudId: string | null;
  nombrePorPersona: Map<string, string>;
  onAbrir: (id: string) => void;
}) {
  const solicitudQ = useSolicitud(solicitudId ?? "");
  const s = solicitudId ? solicitudQ.data : undefined;

  if (!solicitudId) {
    return (
      <Card className="flex h-full min-h-[160px] items-center justify-center">
        <p className="text-sm text-text-muted">Seleccioná una solicitud de la cola.</p>
      </Card>
    );
  }

  if (solicitudQ.isLoading) {
    return (
      <Card className="min-h-[160px]">
        <p className="text-sm text-text-muted">Cargando detalle…</p>
      </Card>
    );
  }

  if (solicitudQ.isError || !s) {
    return (
      <Card className="min-h-[160px]">
        <p role="alert" className="text-sm text-neg">
          No se pudo cargar el detalle de la solicitud.
        </p>
      </Card>
    );
  }

  const nombre = nombrePorPersona.get(s.persona_id);

  return (
    <Card className="min-h-[160px] space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{nombre ?? `Solicitud #${idCorto(s.id)}`}</CardTitle>
          {s.producto_id && (
            <p className="text-sm text-text-muted">Producto #{idCorto(s.producto_id)}</p>
          )}
        </div>
        <Badge tone={ESTADO_TONE[s.estado] ?? "default"}>{s.estado}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-text-muted">Monto</dt>
          <dd className="font-medium text-text">
            <MoneyText value={s.monto ?? null} />
          </dd>
        </div>
        {s.cantidad_cuotas != null && (
          <div>
            <dt className="text-text-muted">Cuotas</dt>
            <dd className="font-medium text-text">{s.cantidad_cuotas}</dd>
          </div>
        )}
      </dl>

      <Button onClick={() => onAbrir(s.id)}>Abrir evaluación completa</Button>
    </Card>
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
