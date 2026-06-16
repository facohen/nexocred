import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTimeline } from "./hooks";
import { InteraccionForm } from "./InteraccionForm";

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
  const [mostrarForm, setMostrarForm] = useState(false);

  if (q.isLoading) return <p className="text-sm text-text-muted">Cargando timeline…</p>;
  if (q.isError)
    return (
      <p role="alert" className="text-sm text-neg">
        No se pudo cargar el timeline.
      </p>
    );

  const eventos = [...(q.data?.data ?? [])].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Timeline 360</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMostrarForm((v) => !v)}
          >
            {mostrarForm ? "Cancelar" : "Nueva interacción"}
          </Button>
        </div>
        {eventos.length === 0 ? (
          <p className="text-sm text-text-muted">Sin actividad.</p>
        ) : (
          <ol className="space-y-2">
            {eventos.map((e, idx) => (
              <li
                key={idx}
                data-testid="timeline-evento"
                className="flex items-start gap-2 text-sm"
              >
                <Badge tone={TONO[e.tipo] ?? "default"}>{e.tipo}</Badge>
                <div>
                  <div>{e.detalle ?? e.tipo}</div>
                  <div className="text-xs text-text-subtle">
                    {new Date(e.fecha).toLocaleString("es-AR")}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {mostrarForm && (
        <InteraccionForm personaId={personaId} onCreated={() => setMostrarForm(false)} />
      )}
    </div>
  );
}
