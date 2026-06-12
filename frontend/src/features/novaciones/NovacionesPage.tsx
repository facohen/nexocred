import { useState } from "react";
import { useNovacion } from "@/lib/api/queries";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Tipo = "refinanciar" | "consolidar" | "transferir" | "repactar-rapido";

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "refinanciar", label: "Refinanciar" },
  { value: "consolidar", label: "Consolidar" },
  { value: "transferir", label: "Transferir" },
  { value: "repactar-rapido", label: "Repactar rápido" },
];

export function NovacionesPage() {
  const [tipo, setTipo] = useState<Tipo>("refinanciar");
  const [prestamoId, setPrestamoId] = useState("prestamo-1");
  const novacion = useNovacion();
  const resultado = novacion.data;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Novaciones</h1>

      <Card>
        <CardTitle>Tipo de novación</CardTitle>
        <div className="mb-4 flex gap-2">
          {TIPOS.map((t) => (
            <Button
              key={t.value}
              variant={tipo === t.value ? "default" : "outline"}
              size="sm"
              onClick={() => setTipo(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="prestamo-origen" className="text-sm font-medium">
              Préstamo origen
            </label>
            <Input
              id="prestamo-origen"
              value={prestamoId}
              onChange={(e) => setPrestamoId(e.target.value)}
            />
          </div>
          <Button
            onClick={() => novacion.mutate({ tipo, body: { prestamo_id: prestamoId } })}
            disabled={novacion.isPending}
          >
            {novacion.isPending ? "Ejecutando…" : "Ejecutar novación"}
          </Button>
        </div>
      </Card>

      {resultado && (
        <Card>
          <CardTitle>Cadena de novación</CardTitle>
          <p className="mb-3 text-sm">
            Tipo <Badge>{resultado.tipo}</Badge> · estado <Badge>{resultado.estado}</Badge>
          </p>
          <p className="mb-2 text-sm">
            Nuevo préstamo: <span className="font-medium">{resultado.nuevo_prestamo_id ?? "—"}</span>
          </p>
          <h4 className="text-sm font-medium">Préstamos origen</h4>
          <ul className="text-sm">
            {(resultado.origenes ?? []).map((origenId, i) => (
              <li key={i} className="border-t border-border py-1">
                {origenId}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
