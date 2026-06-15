import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSolicitudes, usePersonas, useSolicitud } from "@/lib/api/queries";
import { useTablero, useAlertas } from "@/features/riesgo/hooks";
import { formatPercent, severidadTone } from "@/features/riesgo/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/MoneyText";
import { WorkInbox, WorkInboxHero, InboxRow, type InboxSection } from "@/components/WorkInbox";
import type { components } from "@/lib/api/schema";

type Solicitud = components["schemas"]["SolicitudOut"];

// Cola del analista de riesgo, priorizada por estado del workflow. El orden de
// las secciones ES la prioridad: lo que está en evaluación primero, luego lo
// evaluado pendiente de aprobar, y al final lo recién ingresado.
const SECCIONES_COLA: {
  estado: string;
  title: string;
  accent: InboxSection<Solicitud>["accent"];
}[] = [
  { estado: "en_evaluacion", title: "En evaluación", accent: "warning" },
  { estado: "evaluada", title: "Evaluadas — pendientes de aprobar", accent: "warning" },
  { estado: "ingresada", title: "Ingresadas", accent: "default" },
];

const ESTADO_TONE: Record<string, "default" | "warning" | "success" | "danger"> = {
  ingresada: "default",
  en_evaluacion: "warning",
  evaluada: "warning",
  aprobada: "success",
  rechazada: "danger",
};

// PAR30 por encima de este umbral pinta el KPI en tono de alarma.
const PAR30_UMBRAL = 10;

function idCorto(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Home integrado del ANALISTA DE RIESGO. Antes su trabajo estaba fragmentado en
 * tres pantallas (/evaluacion, /riesgo/tablero, /riesgo/alertas) sin contexto
 * compartido. Acá converge: mini-tablero de riesgo + alertas activas + la cola
 * de solicitudes a evaluar, priorizada. El detalle (tablero completo, alertas)
 * sigue accesible vía deep-link desde los KPIs.
 */
export function EvaluacionHome() {
  const navigate = useNavigate();
  const solicitudesQ = useSolicitudes();
  const personasQ = usePersonas();
  const tableroQ = useTablero();
  const alertasQ = useAlertas();

  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const solicitudes = solicitudesQ.data?.data ?? [];
  const aEvaluar = solicitudes.filter((s) => SECCIONES_COLA.some((sec) => sec.estado === s.estado));
  const alertasActivas = (alertasQ.data?.data ?? []).filter((a) => a.estado === "activa");
  const tablero = tableroQ.data;
  const par30 = tablero ? Number(tablero.par30) : null;

  const sections: InboxSection<Solicitud>[] = SECCIONES_COLA.map((sec) => ({
    id: sec.estado,
    title: sec.title,
    accent: sec.accent,
    items: aEvaluar.filter((s) => s.estado === sec.estado),
    emptyText: "—",
  })).filter((s) => s.items.length > 0);

  const colaVacia = aEvaluar.length === 0;

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Evaluación"
        subtitle={`${aEvaluar.length} ${
          aEvaluar.length === 1 ? "solicitud" : "solicitudes"
        } en tu cola de riesgo`}
      />

      {/* Mini-tablero: contexto de riesgo inmediato. Cada KPI lleva al detalle. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="A evaluar"
          value={`${aEvaluar.length}`}
          tone={aEvaluar.length > 0 ? "warning" : "default"}
        />
        <Kpi
          label="PAR30"
          value={tablero ? formatPercent(tablero.par30) : "—"}
          tone={par30 != null && par30 >= PAR30_UMBRAL ? "danger" : "default"}
          onClick={() => navigate({ to: "/riesgo/tablero" as string })}
        />
        <Kpi
          label="Cartera total"
          value={tablero ? <MoneyText value={tablero.cartera_total} /> : "—"}
          onClick={() => navigate({ to: "/riesgo/tablero" as string })}
        />
        <Kpi
          label="Alertas activas"
          value={`${alertasActivas.length}`}
          tone={alertasActivas.length > 0 ? "warning" : "default"}
          onClick={() => navigate({ to: "/riesgo/alertas" as string })}
        />
      </div>

      {/* Alertas inline: las top-3 activas, con atajo al detalle. */}
      {alertasActivas.length > 0 && (
        <Card className="space-y-3 border-warn-border bg-warn-bg">
          <div className="flex items-center justify-between">
            <CardTitle>Alertas de riesgo</CardTitle>
            <button
              type="button"
              className="text-sm text-brand hover:underline"
              onClick={() => navigate({ to: "/riesgo/alertas" as string })}
            >
              Ver todas
            </button>
          </div>
          <ul className="space-y-2">
            {alertasActivas.slice(0, 3).map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-text">{a.tipo ?? "Alerta"}</span>
                <span className="flex items-center gap-3">
                  {a.metrica && (
                    <span className="text-text-muted">
                      {a.metrica}: {a.valor ?? "—"}
                    </span>
                  )}
                  <Badge tone={severidadTone(a.severidad)}>{a.severidad ?? "—"}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Split-view: cola priorizada (master) + detalle (detail). */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="lg:w-2/5">
          {colaVacia ? (
            <Card className="flex min-h-[160px] items-center justify-center">
              <p className="text-sm text-text-muted">No hay solicitudes esperando evaluación.</p>
            </Card>
          ) : (
            <WorkInbox
              sections={sections}
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
                        {s.score != null ? ` · score ${s.score}` : ""}
                      </span>
                    }
                    signals={<Badge tone={ESTADO_TONE[s.estado] ?? "default"}>{s.estado}</Badge>}
                    onClick={() => setSelectedId(s.id)}
                    className={selected ? "bg-surface-sunken ring-1 ring-border" : undefined}
                  />
                );
              }}
            />
          )}
        </div>

        <div className="lg:w-3/5">
          <SolicitudDetail
            solicitudId={selectedId}
            nombrePorPersona={nombrePorPersona}
            onAbrir={(id) => navigate({ to: `/solicitudes/${id}` as string })}
          />
        </div>
      </div>
    </div>
  );
}

/** KPI compacto del mini-tablero. Clickeable cuando lleva a una vista de detalle. */
function Kpi({
  label,
  value,
  tone = "default",
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "warning" | "danger";
  onClick?: () => void;
}) {
  const toneClass = tone === "danger" ? "text-neg" : tone === "warning" ? "text-warn" : "text-text";
  const inner = (
    <>
      <div className="text-xs text-text-subtle">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </>
  );
  // Card no acepta onClick; cuando el KPI navega lo envolvemos en un botón que
  // ocupa toda la card (text-left para no centrar el contenido del Card).
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg text-left transition-colors hover:opacity-90"
      >
        <Card className="space-y-1 hover:bg-surface-sunken">{inner}</Card>
      </button>
    );
  }
  return <Card className="space-y-1">{inner}</Card>;
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
