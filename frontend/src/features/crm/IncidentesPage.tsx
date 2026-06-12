import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { useIncidentes, useCrearIncidente } from "./hooks";

/** CRUD básico de incidentes del operador. */
export function IncidentesPage() {
  const q = useIncidentes();
  const crear = useCrearIncidente();
  const [titulo, setTitulo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  if (q.isLoading) return <p className="p-4 text-sm text-foreground/60">Cargando incidentes…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-red-700">No se pudieron cargar los incidentes.</p>;
  const incidentes = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Incidentes</h1>

      <Card>
        <CardTitle>Nuevo incidente</CardTitle>
        <div className="flex items-end gap-2">
          <FormField label="Título" name="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <Button
            onClick={async () => {
              await crear.mutateAsync({ titulo, tipo: "queja", severidad: "media", persona_id: null, detalle: null, operador_id: null });
              setTitulo("");
              setAviso("Incidente creado.");
            }}
            disabled={!titulo || crear.isPending}
          >
            Crear incidente
          </Button>
        </div>
        {aviso && <p className="mt-2 text-sm text-green-700">{aviso}</p>}
      </Card>

      {incidentes.length === 0 ? (
        <p className="text-sm text-foreground/60">Sin incidentes.</p>
      ) : (
        <ul className="space-y-2">
          {incidentes.map((i) => (
            <li key={i.id}>
              <Card className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{i.titulo}</div>
                  {i.detalle && <div className="text-xs text-foreground/60">{i.detalle}</div>}
                </div>
                <div className="flex gap-2">
                  {i.severidad && <Badge tone="warning">{i.severidad}</Badge>}
                  <Badge tone="default">{i.estado}</Badge>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
