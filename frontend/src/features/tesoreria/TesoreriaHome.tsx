import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import {
  WorkInbox,
  WorkInboxHero,
  InboxRow,
  type InboxSection,
} from "@/components/WorkInbox";
import { formatPercent } from "@/features/riesgo/format";
import { usePosicion } from "./hooks";
import { useLiquidaciones } from "@/features/vendedores/hooks";
import type { components } from "@/lib/api/schema";

type Liquidacion = components["schemas"]["LiquidacionOut"];

const SEMAFORO: Record<string, "success" | "warning" | "danger"> = {
  verde: "success",
  amarillo: "warning",
  rojo: "danger",
};

/**
 * HOME del rol Tesorería (patrón inbox-driven). Posición de capital arriba
 * (KPIs + semáforo) y una bandeja de liquidaciones que requieren acción:
 * aprobar (borrador) y pagar (aprobada). Las acciones reales viven en
 * /vendedores/liquidaciones; acá solo deep-link.
 */
export function TesoreriaHome() {
  const navigate = useNavigate();
  const posQ = usePosicion();
  const liqQ = useLiquidaciones();

  if (posQ.isLoading) {
    return <p className="p-4 text-sm text-text-muted">Cargando tu posición…</p>;
  }
  if (posQ.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudo cargar la posición de tesorería.
      </p>
    );
  }

  const pos = posQ.data!;
  const liquidaciones = liqQ.data ?? [];
  const aAprobar = liquidaciones.filter((l) => l.estado === "borrador");
  const aPagar = liquidaciones.filter((l) => l.estado === "aprobada");

  const filaLiquidacion = (l: Liquidacion) => (
    <InboxRow
      title={`Liquidación ${l.periodo_desde}–${l.periodo_hasta}`}
      signals={
        <>
          <Badge tone={l.estado === "borrador" ? "warning" : "info"}>{l.estado}</Badge>
          <MoneyText value={l.monto_total} intent="expense" />
        </>
      }
      action={
        <a
          href="/vendedores/liquidaciones"
          onClick={(e) => {
            e.preventDefault();
            navigate({ to: "/vendedores/liquidaciones" as string });
          }}
          className="text-sm text-brand hover:underline"
        >
          Ver
        </a>
      }
    />
  );

  const sections: InboxSection<Liquidacion>[] = [
    {
      title: "Liquidaciones a aprobar",
      items: aAprobar,
      accent: "warning",
      emptyText: "Sin liquidaciones pendientes de aprobación.",
    },
    {
      title: "Liquidaciones a pagar",
      items: aPagar,
      accent: "default",
      emptyText: "Sin liquidaciones pendientes de pago.",
    },
  ];

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Tesorería"
        subtitle={
          <>
            Capital disponible <MoneyText value={pos.capital_disponible} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs text-text-muted">Capital disponible</div>
          <MoneyText value={pos.capital_disponible} className="text-lg font-semibold" />
        </Card>
        <Card>
          <div className="text-xs text-text-muted">Capital colocado</div>
          <MoneyText value={pos.capital_colocado} className="text-lg font-semibold" />
        </Card>
        <Card>
          <div className="text-xs text-text-muted">Utilización</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatPercent(pos.utilizacion)}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-text-muted">Estado de utilización</div>
          <Badge tone={SEMAFORO[pos.semaforo] ?? "default"}>
            <span data-testid="semaforo">{pos.semaforo}</span>
          </Badge>
        </Card>
      </div>

      <WorkInbox sections={sections} renderItem={filaLiquidacion} keyFor={(l) => l.id} />
    </div>
  );
}
