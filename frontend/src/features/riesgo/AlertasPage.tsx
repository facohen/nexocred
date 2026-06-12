import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { useAlertas, useResolverAlerta, useAsignarAlerta } from "./hooks";

/** Gestión de alertas: resolver (con justificación) y asignar (crea tarea). */
export function AlertasPage() {
  const q = useAlertas();
  const resolver = useResolverAlerta();
  const asignar = useAsignarAlerta();
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  if (q.isLoading) return <p data-testid="alertas-loading" className="p-4 text-sm text-foreground/60">Cargando alertas…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-red-700">No se pudieron cargar las alertas.</p>;

  const alertas = (q.data?.data ?? []).filter((a) => a.estado === "activa");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Alertas</h1>
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}

      {alertas.length === 0 ? (
        <p className="text-sm text-foreground/60">No hay alertas activas.</p>
      ) : (
        <ul className="space-y-2">
          {alertas.map((a) => (
            <li key={a.id}>
              <Card className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{a.tipo}</div>
                  <div className="flex gap-2">
                    {a.severidad && <Badge tone={a.severidad === "alta" ? "danger" : "warning"}>{a.severidad}</Badge>}
                    {a.metrica && (
                      <span className="text-xs text-foreground/60 tabular-nums">
                        {a.metrica}: {a.valor}
                      </span>
                    )}
                  </div>
                </div>

                {resolviendo === a.id ? (
                  <div className="flex items-end gap-2">
                    <FormField
                      label="Justificación"
                      name="justificacion"
                      value={justificacion}
                      onChange={(e) => setJustificacion(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        await resolver.mutateAsync({ id: a.id, justificacion });
                        setResolviendo(null);
                        setJustificacion("");
                        setAviso("Alerta resuelta.");
                      }}
                      disabled={!justificacion || resolver.isPending}
                    >
                      Confirmar resolución
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setResolviendo(a.id)}>
                      Resolver
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await asignar.mutateAsync({ id: a.id, operadorId: "user-operador" });
                        setAviso("Tarea creada y alerta asignada.");
                      }}
                    >
                      Asignar
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
