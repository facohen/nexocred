import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTimeline } from "./hooks";

const TONO: Record<string, "default" | "success" | "warning" | "danger"> = {
  interaccion: "default",
  credito: "success",
  incidente: "danger",
  novacion: "warning",
};

/**
 * Timeline 360 unificado de la persona: interacciones + incidentes + eventos de
 * crédito + novaciones, ordenados por fecha descendente.
 */
export function TimelinePanel({ personaId }: { personaId: string }) {
  const q = useTimeline(personaId);
  if (q.isLoading) return <p className="text-sm text-foreground/60">Cargando timeline…</p>;
  if (q.isError) return <p role="alert" className="text-sm text-red-700">No se pudo cargar el timeline.</p>;

  const eventos = [...(q.data?.data ?? [])].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

  return (
    <Card>
      <CardTitle>Timeline 360</CardTitle>
      {eventos.length === 0 ? (
        <p className="text-sm text-foreground/60">Sin actividad.</p>
      ) : (
        <ol className="space-y-2">
          {eventos.map((e, idx) => (
            <li key={idx} data-testid="timeline-evento" className="flex items-start gap-2 text-sm">
              <Badge tone={TONO[e.tipo] ?? "default"}>{e.tipo}</Badge>
              <div>
                <div>{e.detalle ?? e.tipo}</div>
                <div className="text-xs text-foreground/50">{new Date(e.fecha).toLocaleString("es-AR")}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
