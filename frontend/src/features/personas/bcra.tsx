import { useDeudaBcra, useSyncBcra } from "@/lib/api/queries";
import { MoneyText } from "@/components/MoneyText";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";

const SITUACION_TONE: Record<number, "success" | "warning" | "danger"> = {
  1: "success",
  2: "warning",
  3: "warning",
  4: "danger",
  5: "danger",
};

export function BcraPanel({ personaId }: { personaId: string }) {
  const { data } = useDeudaBcra(personaId);
  const sync = useSyncBcra(personaId);
  const deudas = sync.data?.data ?? data?.data ?? [];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>BCRA — central de deudores</CardTitle>
        <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? "Consultando…" : "Consultar BCRA"}
        </Button>
      </div>
      <div aria-label="Deuda BCRA">
        {deudas.length === 0 ? (
          <p className="text-sm text-foreground/50">Sin deuda informada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-foreground/60">
                <th className="py-1">Entidad</th>
                <th className="py-1">Situación</th>
                <th className="py-1 text-right">Monto</th>
                <th className="py-1">Informe</th>
              </tr>
            </thead>
            <tbody>
              {deudas.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-1">{d.entidad}</td>
                  <td className="py-1">
                    <Badge tone={SITUACION_TONE[d.situacion] ?? "default"}>
                      Situación {d.situacion}
                    </Badge>
                  </td>
                  <td className="py-1 text-right">
                    <MoneyText value={d.monto} />
                  </td>
                  <td className="py-1">{d.fecha_informe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
