import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useSolicitud, useChecklist, useAccionSolicitud } from "@/lib/api/queries";
import { newIdempotencyKey } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { MoneyText } from "@/components/MoneyText";
import { ApiError } from "@/lib/api/client";
import { useSession, hasRole } from "@/lib/auth";

export function SolicitudDetailPage() {
  const { solicitudId } = useParams({ strict: false }) as { solicitudId: string };
  const { user } = useSession();
  // El vendedor ve la solicitud en modo lectura: evaluar/simular/aprobar son
  // acciones del analista de riesgo, no del vendedor que la originó.
  const puedeAccionar = hasRole(user, "analista_riesgo");
  const { data: solicitud } = useSolicitud(solicitudId);
  const { data: checklistData, isSuccess: checklistListo } = useChecklist(solicitudId);
  const accion = useAccionSolicitud(solicitudId);
  // Stable key per (solicitud) disbursement intent: a double-click / re-submit
  // reuses the same Idempotency-Key so the backend dedupes the disbursement.
  // solicitudId es dependencia DELIBERADA: regenera la key al cambiar de solicitud.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const desembolsoKey = useMemo(() => newIdempotencyKey(), [solicitudId]);

  const checklist = checklistData?.checklist ?? [];
  const bcraItem = checklist.find((c) => c.regla === "bcra");
  // Fail-safe: si la regla bcra no llegó o es desconocida, se considera
  // bloqueante (no se puede aprobar sin confirmar BCRA).
  const bcraBlocked = !bcraItem || !bcraItem.ok;
  const algunaFalla = checklist.some((c) => !c.ok);
  // Aprobar sólo cuando el checklist cargó Y no hay políticas en falla Y BCRA OK.
  const aprobarDeshabilitado = accion.isPending || !checklistListo || algunaFalla || bcraBlocked;
  const accionError =
    accion.error instanceof ApiError
      ? accion.error.message
      : accion.error
        ? "No se pudo completar la acción"
        : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Solicitud {solicitudId}</h1>
          {solicitud && (
            <p className="text-sm text-text-muted">
              <MoneyText value={solicitud.monto ?? null} intent="neutral" /> ·{" "}
              {solicitud.cantidad_cuotas} cuotas · <Badge>{solicitud.estado}</Badge>
            </p>
          )}
        </div>
        {puedeAccionar && (
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
            <TransactionButton
              onClick={() =>
                accion.mutate({ accion: "desembolsar", idempotencyKey: desembolsoKey })
              }
              disabled={aprobarDeshabilitado}
              pending={accion.isPending}
              title={
                !checklistListo
                  ? "Validando políticas…"
                  : bcraBlocked
                    ? "Bloqueado: situación BCRA pendiente o vencida"
                    : undefined
              }
            >
              Aprobar y desembolsar
            </TransactionButton>
          </div>
        )}
      </div>

      {accionError && (
        <div
          role="alert"
          className="rounded-lg border border-neg-border bg-neg-bg p-3 text-sm text-neg"
        >
          {accionError}
        </div>
      )}

      {checklistListo && bcraBlocked && (
        <div
          role="alert"
          className="rounded-lg border border-neg-border bg-neg-bg p-3 text-sm text-neg"
        >
          La verificación BCRA está pendiente o vencida. No se puede aprobar la solicitud hasta
          resolverla.
        </div>
      )}

      <Card>
        <CardTitle>Checklist de políticas</CardTitle>
        <ul className="space-y-2">
          {checklist.map((c) => (
            <li key={c.regla} className="flex items-center justify-between text-sm">
              <span>{c.etiqueta}</span>
              <span className="flex items-center gap-3">
                <span className="text-text-muted">{c.detalle}</span>
                <Badge tone={c.ok ? "success" : "danger"}>{c.ok ? "OK" : "Falla"}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
