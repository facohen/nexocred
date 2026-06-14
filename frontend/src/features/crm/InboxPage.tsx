import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkInbox, WorkInboxHero, InboxRow, type InboxSection } from "@/components/WorkInbox";
import { useTareas, useCompletarTarea, useIncidentes } from "./hooks";
import type { components } from "@/lib/api/schema";

type Tarea = components["schemas"]["TareaOut"];
type Incidente = components["schemas"]["IncidenteOut"];

/** Clasifica una tarea pendiente por urgencia según su vencimiento. */
function clasificar(tareas: Tarea[]): {
  vencidas: Tarea[];
  hoy: Tarea[];
  proximas: Tarea[];
} {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const pendientes = tareas.filter((t) => t.estado !== "completada");
  const vencidas: Tarea[] = [];
  const hoy: Tarea[] = [];
  const proximas: Tarea[] = [];
  for (const t of pendientes) {
    const v = t.vencimiento?.slice(0, 10);
    if (!v) proximas.push(t);
    else if (v < hoyISO) vencidas.push(t);
    else if (v === hoyISO) hoy.push(t);
    else proximas.push(t);
  }
  return { vencidas, hoy, proximas };
}

/**
 * Inbox del operador — bandeja de trabajo priorizada (vencidas / hoy / próximas)
 * + incidentes abiertos. Cada fila tiene su acción inline (Completar). Patrón
 * inbox-driven: el operador ve qué resolver hoy, no una tabla.
 */
export function InboxPage() {
  const tareasQ = useTareas();
  const incidentesQ = useIncidentes();
  const completar = useCompletarTarea();
  const [aviso, setAviso] = useState<string | null>(null);

  if (tareasQ.isLoading)
    return <p className="p-4 text-sm text-text-muted">Cargando tu bandeja…</p>;
  if (tareasQ.isError)
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudieron cargar las tareas.
      </p>
    );

  const tareas = tareasQ.data?.data ?? [];
  const incidentes = (incidentesQ.data?.data ?? []).filter((i) => i.estado === "abierto");
  const { vencidas, hoy, proximas } = clasificar(tareas);
  const totalPendiente = vencidas.length + hoy.length + proximas.length;

  const completarTarea = async (t: Tarea) => {
    await completar.mutateAsync({ id: t.id, detalle: "Gestión registrada" });
    setAviso("Tarea completada · interacción registrada.");
  };

  const filaTarea = (t: Tarea) => (
    <InboxRow
      title={t.titulo}
      context={t.descripcion ?? undefined}
      signals={
        <>
          {t.prioridad && (
            <Badge tone={t.prioridad === "alta" ? "danger" : "default"}>{t.prioridad}</Badge>
          )}
          {t.vencimiento && (
            <span className="font-num text-xs text-text-subtle">
              vence {t.vencimiento.slice(0, 10)}
            </span>
          )}
        </>
      }
      action={
        <Button size="sm" onClick={() => completarTarea(t)}>
          Completar
        </Button>
      }
    />
  );

  const tareaSections: InboxSection<Tarea>[] = [
    { title: "Vencidas", items: vencidas, accent: "danger", emptyText: "Nada vencido. 👌" },
    { title: "Para hoy", items: hoy, accent: "warning", emptyText: "Sin tareas para hoy." },
    { title: "Próximas", items: proximas, emptyText: "Sin tareas próximas." },
  ];

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Mi inbox"
        subtitle={
          totalPendiente === 0
            ? "Estás al día — sin tareas pendientes."
            : `${totalPendiente} tareas pendientes${vencidas.length ? ` · ${vencidas.length} vencidas` : ""}`
        }
      />
      {aviso && <p className="text-sm text-pos">{aviso}</p>}

      <WorkInbox sections={tareaSections} renderItem={filaTarea} keyFor={(t) => t.id} />

      <WorkInbox
        sections={[
          {
            title: "Incidentes abiertos",
            items: incidentes,
            accent: "warning",
            emptyText: "Sin incidentes abiertos.",
          },
        ]}
        renderItem={(i: Incidente) => (
          <InboxRow
            title={i.titulo}
            context={i.detalle ?? undefined}
            signals={
              <>
                <Badge tone="info">{i.tipo}</Badge>
                {i.severidad && (
                  <Badge tone={i.severidad === "alta" ? "danger" : "warning"}>{i.severidad}</Badge>
                )}
              </>
            }
            action={
              <a
                href={i.persona_id ? `/personas/${i.persona_id}` : undefined}
                className="text-sm text-brand hover:underline"
              >
                Ver
              </a>
            }
          />
        )}
        keyFor={(i) => i.id}
      />
    </div>
  );
}
