import { useParams } from "@tanstack/react-router";
import {
  usePrestamo,
  useCuotas,
  usePagosDePrestamo,
  usePayoff,
} from "@/lib/api/queries";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";

export function PrestamoDetailPage() {
  const { prestamoId } = useParams({ strict: false }) as { prestamoId: string };
  const { data: prestamo } = usePrestamo(prestamoId);
  const { data: cuotasData } = useCuotas(prestamoId);
  const { data: pagosData } = usePagosDePrestamo(prestamoId);
  const { data: payoff } = usePayoff(prestamoId);

  const cuotas = cuotasData?.data ?? [];
  const pagos = pagosData?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Préstamo {prestamoId}</h1>
        {prestamo && (
          <p className="text-sm text-foreground/60">
            Capital <MoneyText value={prestamo.capital ?? null} /> ·{" "}
            <Badge tone="success">{prestamo.estado}</Badge>
          </p>
        )}
      </div>

      {prestamo?.snapshot_terminos && (
        <Card>
          <CardTitle>Snapshot de términos (al desembolso)</CardTitle>
          <pre className="overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(prestamo.snapshot_terminos, null, 2)}
          </pre>
        </Card>
      )}

      <Card>
        <CardTitle>Cronograma de cuotas</CardTitle>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-foreground/60">
              <th className="py-1">#</th>
              <th className="py-1">Vencimiento</th>
              <th className="py-1 text-right">Capital</th>
              <th className="py-1 text-right">Interés</th>
              <th className="py-1 text-right">Cuota</th>
              <th className="py-1 text-right">Saldo</th>
              <th className="py-1">Estado</th>
            </tr>
          </thead>
          <tbody>
            {cuotas.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="py-1">{c.numero}</td>
                <td className="py-1">{c.vencimiento}</td>
                <td className="py-1 text-right">
                  <MoneyText value={c.capital ?? null} />
                </td>
                <td className="py-1 text-right">
                  <MoneyText value={c.interes ?? null} />
                </td>
                <td className="py-1 text-right">
                  <MoneyText value={c.cuota ?? null} />
                </td>
                <td className="py-1 text-right">
                  <MoneyText value={c.saldo ?? null} />
                </td>
                <td className="py-1">
                  <Badge tone={c.estado === "pagada" ? "success" : "default"}>{c.estado}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardTitle>Historial de pagos</CardTitle>
        {pagos.length === 0 ? (
          <p className="text-sm text-foreground/50">Sin pagos registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-foreground/60">
                <th className="py-1">Fecha</th>
                <th className="py-1 text-right">Monto</th>
                <th className="py-1">Canal</th>
                <th className="py-1">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-1">{p.fecha_negocio}</td>
                  <td className="py-1 text-right">
                    <MoneyText value={p.monto ?? null} />
                  </td>
                  <td className="py-1">{p.canal}</td>
                  <td className="py-1">
                    <Badge>{p.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {payoff && (
        <Card>
          <div aria-label="Payoff (cancelación anticipada)">
            <CardTitle>Payoff — cancelación al {payoff.fecha_negocio}</CardTitle>
            <dl className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs text-foreground/50">Capital</dt>
                <dd>
                  <MoneyText value={payoff.capital} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/50">Interés</dt>
                <dd>
                  <MoneyText value={payoff.interes} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/50">Punitorio</dt>
                <dd>
                  <MoneyText value={payoff.punitorio} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/50">Total</dt>
                <dd className="font-semibold">
                  <MoneyText value={payoff.total} />
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      )}
    </div>
  );
}
