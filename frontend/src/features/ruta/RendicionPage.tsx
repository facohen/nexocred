import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { FormField } from "@/components/FormField";
import { MoneyText } from "@/components/MoneyText";
import { ApiError } from "@/lib/api/client";
import { useRendicion, useAgregarDescargo, useCambiarEstadoRendicion } from "./rendicionHooks";

/**
 * Cierre de rendición. Muestra total cobrado, descargos y la diferencia
 * (cobrado − descargos aprobados, calculada por el backend), permite agregar
 * descargos y presentar la rendición. Toda la plata es string vía MoneyText.
 */
export function RendicionPage({ rendicionId }: { rendicionId: string }) {
  const q = useRendicion(rendicionId);
  const agregar = useAgregarDescargo(rendicionId);
  const cambiarEstado = useCambiarEstadoRendicion(rendicionId);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  if (q.isLoading) return <p className="p-4 text-sm text-text-muted">Cargando rendición…</p>;
  if (q.isError) {
    const msg = q.error instanceof ApiError ? q.error.message : "Error al cargar la rendición";
    return (
      <div role="alert" className="m-4 rounded-lg border border-neg-border bg-neg-bg p-3 text-sm text-neg">
        {msg}
      </div>
    );
  }
  const r = q.data!;

  async function onAgregar() {
    setAviso(null);
    try {
      await agregar.mutateAsync({ concepto, monto });
      setConcepto("");
      setMonto("");
      setAviso("Descargo registrado.");
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : "No se pudo registrar el descargo.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Rendición</h1>
        <Badge tone="default">{r.estado}</Badge>
      </div>

      <Card>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-text-muted">Total cobrado</div>
            <MoneyText value={r.total_cobrado} className="font-semibold" />
          </div>
          <div>
            <div className="text-text-muted">Total descargos</div>
            <MoneyText value={r.total_descargos} className="font-semibold" />
          </div>
          <div>
            <div className="text-text-muted">Diferencia</div>
            <MoneyText value={r.diferencia} className="font-semibold" />
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Descargos</CardTitle>
        {r.descargos.length === 0 ? (
          <p className="text-sm text-text-muted">Sin descargos.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {r.descargos.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <span>
                  {d.concepto} <Badge tone={d.estado === "aprobado" ? "success" : "warning"}>{d.estado}</Badge>
                </span>
                <MoneyText value={d.monto} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
          <FormField label="Concepto" name="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          <FormField label="Monto" name="monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Button onClick={onAgregar} disabled={agregar.isPending || !concepto || !monto}>
            Agregar descargo
          </Button>
        </div>
        {aviso && <p className="mt-2 text-sm text-text-muted">{aviso}</p>}
      </Card>

      <div className="flex gap-2">
        <TransactionButton
          onClick={() => cambiarEstado.mutate("presentada")}
          pending={cambiarEstado.isPending}
          disabled={r.estado === "presentada"}
        >
          Presentar rendición
        </TransactionButton>
      </div>
    </div>
  );
}
