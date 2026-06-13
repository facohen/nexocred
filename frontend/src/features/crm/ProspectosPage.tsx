import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProspectos, usePromoverProspecto } from "./hooks";

/** Pipeline de prospectos con promoción a persona/cliente. */
export function ProspectosPage() {
  const q = useProspectos();
  const promover = usePromoverProspecto();
  const [aviso, setAviso] = useState<string | null>(null);

  if (q.isLoading) return <p className="p-4 text-sm text-text-muted">Cargando prospectos…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-neg">No se pudieron cargar los prospectos.</p>;
  const prospectos = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Prospectos</h1>
      {aviso && <p className="text-sm text-pos">{aviso}</p>}
      {prospectos.length === 0 ? (
        <p className="text-sm text-text-muted">Sin prospectos.</p>
      ) : (
        <ul className="space-y-2">
          {prospectos.map((p) => (
            <li key={p.id}>
              <Card className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{p.nombre}</div>
                  {p.telefono && <div className="text-xs text-text-muted">{p.telefono}</div>}
                  <Badge tone="default">{p.estado}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await promover.mutateAsync(p.id);
                    setAviso(`Prospecto ${p.nombre} promovido.`);
                  }}
                >
                  Promover
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
