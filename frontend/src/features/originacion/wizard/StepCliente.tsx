import { useState } from "react";
import { usePersonas } from "@/lib/api/queries";
import { PersonaForm } from "@/features/personas/PersonaForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export interface ClienteElegido {
  id: string;
  nombre: string;
  dni: string;
}

/**
 * Paso 1 del asistente: elegir un cliente existente (búsqueda) o dar de alta uno
 * nuevo reusando el PersonaForm (misma validación Zod, mismo contrato). No se
 * reescribe la lógica de alta: se embebe.
 */
export function StepCliente({
  onElegir,
}: {
  onElegir: (cliente: ClienteElegido) => void;
}) {
  const [modo, setModo] = useState<"buscar" | "crear">("buscar");
  const [q, setQ] = useState("");
  const personasQ = usePersonas(q.trim() || undefined);
  const resultados = personasQ.data?.data ?? [];

  if (modo === "crear") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Nuevo cliente</h2>
          <Button variant="ghost" size="sm" onClick={() => setModo("buscar")}>
            ← Buscar uno existente
          </Button>
        </div>
        <PersonaForm
          onCreated={(id) =>
            // El nombre/DNI se completan al avanzar; con el id basta para originar.
            onElegir({ id, nombre: "Nuevo cliente", dni: "" })
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text">¿Para quién es el préstamo?</h2>
        <Button size="sm" onClick={() => setModo("crear")}>
          + Cliente nuevo
        </Button>
      </div>

      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, apellido o DNI…"
        aria-label="Buscar cliente"
        autoFocus
      />

      {personasQ.isLoading && (
        <p className="text-sm text-text-muted">Buscando…</p>
      )}
      {!personasQ.isLoading && resultados.length === 0 && (
        <p className="text-sm text-text-muted">
          Sin resultados. Probá otro término o creá un cliente nuevo.
        </p>
      )}

      <ul className="space-y-2">
        {resultados.map((p) => (
          <li key={p.id}>
            <Card className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-text">
                  {p.nombre} {p.apellido}
                </div>
                <div className="text-xs text-text-muted">DNI {p.dni}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onElegir({
                    id: p.id,
                    nombre: `${p.nombre} ${p.apellido}`.trim(),
                    dni: p.dni,
                  })
                }
              >
                Elegir
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
