import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { useAsignar, useAsignarMasivo } from "./hooks";

/** Asignación de personas a operadores: individual y masiva (admin). */
export function AsignacionesPage() {
  const asignar = useAsignar();
  const masivo = useAsignarMasivo();
  const [operadorId, setOperadorId] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [personas, setPersonas] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Asignaciones CRM</h1>

      <Card>
        <CardTitle>Asignación individual</CardTitle>
        <div className="flex items-end gap-2">
          <FormField label="Persona" name="persona" value={personaId} onChange={(e) => setPersonaId(e.target.value)} />
          <FormField label="Asignar a operador" name="operador1" value={operadorId} onChange={(e) => setOperadorId(e.target.value)} />
          <Button
            onClick={async () => {
              await asignar.mutateAsync({ persona_id: personaId, operador_id: operadorId });
              setAviso("Persona asignada.");
            }}
            disabled={!personaId || !operadorId || asignar.isPending}
          >
            Asignar
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Asignación masiva</CardTitle>
        <div className="flex items-end gap-2">
          <FormField
            label="Personas"
            name="personas"
            placeholder="ids separados por coma"
            value={personas}
            onChange={(e) => setPersonas(e.target.value)}
          />
          <FormField label="Operador" name="operador" placeholder="operador destino" value={operadorId} onChange={(e) => setOperadorId(e.target.value)} />
          <Button
            onClick={async () => {
              const ids = personas.split(",").map((s) => s.trim()).filter(Boolean);
              const res = await masivo.mutateAsync({ operador_id: operadorId, persona_ids: ids });
              setAviso(`${res.asignadas} asignadas.`);
            }}
            disabled={!personas || !operadorId || masivo.isPending}
          >
            Asignar masivo
          </Button>
        </div>
      </Card>

      {aviso && <p className="text-sm text-pos">{aviso}</p>}
    </div>
  );
}
