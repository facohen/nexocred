import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTareas, useCompletarTarea } from "./hooks";

/** Inbox del operador: sus tareas; completar registra una interacción. */
export function InboxPage() {
  const q = useTareas();
  const completar = useCompletarTarea();
  const [aviso, setAviso] = useState<string | null>(null);

  if (q.isLoading) return <p className="p-4 text-sm text-foreground/60">Cargando tareas…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-red-700">No se pudieron cargar las tareas.</p>;
  const tareas = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Inbox</h1>
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}
      {tareas.length === 0 ? (
        <p className="text-sm text-foreground/60">No hay tareas pendientes.</p>
      ) : (
        <ul className="space-y-2">
          {tareas.map((t) => (
            <li key={t.id}>
              <Card className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{t.titulo}</div>
                  {t.descripcion && <div className="text-xs text-foreground/60">{t.descripcion}</div>}
                  <div className="mt-1 flex gap-2">
                    {t.prioridad && <Badge tone={t.prioridad === "alta" ? "danger" : "default"}>{t.prioridad}</Badge>}
                    <Badge tone="default">{t.estado}</Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    await completar.mutateAsync({ id: t.id, detalle: "Gestión registrada" });
                    setAviso("Tarea completada · interacción registrada.");
                  }}
                >
                  Completar
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
