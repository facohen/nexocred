import { useParams } from "@tanstack/react-router";
import { useSolicitud, useChecklist, useAccionSolicitud } from "@/lib/api/queries";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/MoneyText";

export function SolicitudDetailPage() {
  const { solicitudId } = useParams({ strict: false }) as { solicitudId: string };
  const { data: solicitud } = useSolicitud(solicitudId);
  const { data: checklistData } = useChecklist(solicitudId);
  const accion = useAccionSolicitud(solicitudId);

  const checklist = checklistData?.checklist ?? [];
  const bcraItem = checklist.find((c) => c.regla === "bcra");
  const bcraBlocked = bcraItem ? !bcraItem.ok : false;
  const algunaFalla = checklist.some((c) => !c.ok);

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
            onClick={() => accion.mutate({ accion: "desembolsar" })}
            disabled={accion.isPending || bcraBlocked || algunaFalla}
            title={bcraBlocked ? "Bloqueado: situación BCRA vencida" : undefined}
          >
            Aprobar y desembolsar
          </Button>
        </div>
      </div>

      {bcraBlocked && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          La situación BCRA está vencida. No se puede aprobar la solicitud hasta resolverla.
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
