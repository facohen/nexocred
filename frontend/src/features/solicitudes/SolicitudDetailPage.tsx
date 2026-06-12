import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useSolicitud, useChecklist, useAccionSolicitud } from "@/lib/api/queries";
import { newIdempotencyKey } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/MoneyText";

export function SolicitudDetailPage() {
  const { solicitudId } = useParams({ strict: false }) as { solicitudId: string };
  const { data: solicitud } = useSolicitud(solicitudId);
  const { data: checklistData, isSuccess: checklistListo } = useChecklist(solicitudId);
  const accion = useAccionSolicitud(solicitudId);
  // Stable key per (solicitud) disbursement intent: a double-click / re-submit
  // reuses the same Idempotency-Key so the backend dedupes the disbursement.
  const desembolsoKey = useMemo(() => newIdempotencyKey(), [solicitudId]);

  const checklist = checklistData?.checklist ?? [];
  const bcraItem = checklist.find((c) => c.regla === "bcra");
  // Fail-safe: si la regla bcra no llegó o es desconocida, se considera
  // bloqueante (no se puede aprobar sin confirmar BCRA).
  const bcraBlocked = !bcraItem || !bcraItem.ok;
  const algunaFalla = checklist.some((c) => !c.ok);
  // Aprobar sólo cuando el checklist cargó Y no hay políticas en falla Y BCRA OK.
  const aprobarDeshabilitado =
    accion.isPending || !checklistListo || algunaFalla || bcraBlocked;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Solicitud {solicitudId}</h1>
          {solicitud && (
            <p className="text-sm text-foreground/60">
              <MoneyText value={solicitud.monto ?? null} /> · {solicitud.cantidad_cuotas} cuotas ·{" "}
              <Badge>{solicitud.estado}</Badge>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => accion.mutate({ accion: "evaluar" })}
            disabled={accion.isPending}
          >
            Evaluar
          </Button>
          <Button
            variant="outline"
            onClick={() => accion.mutate({ accion: "simular" })}
            disabled={accion.isPending}
          >
            Simular
          </Button>
          <Button
            onClick={() => accion.mutate({ accion: "desembolsar", idempotencyKey: desembolsoKey })}
            disabled={aprobarDeshabilitado}
            title={
              !checklistListo
                ? "Validando políticas…"
                : bcraBlocked
                  ? "Bloqueado: situación BCRA pendiente o vencida"
                  : undefined
            }
          >
            Aprobar y desembolsar
          </Button>
        </div>
      </div>

      {checklistListo && bcraBlocked && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          La verificación BCRA está pendiente o vencida. No se puede aprobar la
          solicitud hasta resolverla.
        </div>
      )}

      <Card>
        <CardTitle>Checklist de políticas</CardTitle>
        <ul className="space-y-2">
          {checklist.map((c) => (
            <li key={c.regla} className="flex items-center justify-between text-sm">
              <span>{c.etiqueta}</span>
              <span className="flex items-center gap-3">
                <span className="text-foreground/60">{c.detalle}</span>
                <Badge tone={c.ok ? "success" : "danger"}>{c.ok ? "OK" : "Falla"}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
