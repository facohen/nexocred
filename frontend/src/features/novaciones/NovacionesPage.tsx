import { useState } from "react";
import { useNovacion } from "@/lib/api/queries";
import { newIdempotencyKey } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Tipo = "refinanciar" | "consolidar" | "transferir" | "repactar-rapido";

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "refinanciar", label: "Refinanciar" },
  { value: "consolidar", label: "Consolidar" },
  { value: "transferir", label: "Transferir" },
  { value: "repactar-rapido", label: "Repactar" },
];

export function NovacionesPage() {
  const [tipo, setTipo] = useState<Tipo>("refinanciar");
  const [prestamoId, setPrestamoId] = useState("");
  // Key estable por intento: los retries del MISMO botón reusan la key (idempotencia);
  // se rota sólo tras un éxito para que la siguiente novación tenga una key fresca.
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());
  const novacion = useNovacion();
  const resultado = novacion.data;
  const errorMsg =
    novacion.error instanceof ApiError
      ? novacion.error.message
      : novacion.error
        ? "No se pudo ejecutar la novación"
        : null;

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
          <TransactionButton
            onClick={() =>
              novacion.mutate(
                { tipo, body: { prestamo_id: prestamoId }, idempotencyKey: idemKey },
                { onSuccess: () => setIdemKey(newIdempotencyKey()) },
              )
            }
            pending={novacion.isPending}
          >
            {novacion.isPending ? "Ejecutando…" : "Ejecutar novación"}
          </TransactionButton>
        </div>
      </Card>

      {errorMsg && (
        <div role="alert" className="rounded-lg border border-neg-border bg-neg-bg p-3 text-sm text-neg">
          {errorMsg}
        </div>
      )}

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
