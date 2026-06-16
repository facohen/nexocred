import { useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { FormField } from "@/components/FormField";
import { MoneyText } from "@/components/MoneyText";
import { addMoney } from "@/lib/money";
import {
  useLiquidaciones,
  useGenerarLiquidacion,
  useAprobarLiquidacion,
  usePagarLiquidacion,
} from "./hooks";
import type { components } from "@/lib/api/schema";

type Liquidacion = components["schemas"]["LiquidacionOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const ESTADO_TONO: Record<string, BadgeTone> = {
  borrador: "default",
  aprobada: "info",
  pagada: "success",
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: "Borrador",
  aprobada: "Aprobada",
  pagada: "Pagada",
};
const labelEstado = (e: string) => ESTADO_LABEL[e] ?? e;

const esPagada = (l: Liquidacion) => l.estado === "pagada";

/**
 * Liquidaciones de comisiones: generar (período), aprobar (admin) y pagar
 * (Idempotency-Key → egreso de caja). Plata siempre string vía MoneyText.
 */
export function LiquidacionesPage() {
  const q = useLiquidaciones();
  const generar = useGenerarLiquidacion();
  const aprobar = useAprobarLiquidacion();
  const pagar = usePagarLiquidacion();
  const [vendedorId, setVendedorId] = useState("user-vendedor");
  const [desde, setDesde] = useState("2026-06-01");
  const [hasta, setHasta] = useState("2026-06-30");

  const liquidaciones = useMemo(() => q.data ?? [], [q.data]);

  // Separamos por cobro: pendientes (lo que el vendedor aún espera) vs. pagadas.
  const { pendientes, pagadas, totalPendiente, totalPagado } = useMemo(() => {
    const pend: Liquidacion[] = [];
    const pag: Liquidacion[] = [];
    for (const l of liquidaciones) (esPagada(l) ? pag : pend).push(l);
    return {
      pendientes: pend,
      pagadas: pag,
      totalPendiente: pend.reduce((a, l) => addMoney(a, l.monto_total ?? "0.00"), "0.00"),
      totalPagado: pag.reduce((a, l) => addMoney(a, l.monto_total ?? "0.00"), "0.00"),
    };
  }, [liquidaciones]);

  if (q.isLoading) return <LiquidacionesSkeleton />;
  if (q.isError)
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudieron cargar las liquidaciones.
      </p>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">Liquidaciones</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Generá, aprobá y pagá las comisiones del período.
        </p>
      </div>

      {/* Dos KPI con distinción visual: por pagar (warn) vs. pagado (pos). */}
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiTotal
          label="Por pagar"
          value={totalPendiente}
          count={pendientes.length}
          intent="warn"
        />
        <KpiTotal label="Pagado" value={totalPagado} count={pagadas.length} intent="pos" />
      </div>

      {/* Generador como panel destacado con borde brand. */}
      <section className="rounded-xl border border-brand-border bg-brand-subtle/40 p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-text">Generar liquidación</h2>
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            label="Vendedor"
            name="vendedor"
            value={vendedorId}
            onChange={(e) => setVendedorId(e.target.value)}
          />
          <FormField
            label="Desde"
            name="desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <FormField
            label="Hasta"
            name="hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
          <TransactionButton
            onClick={() =>
              generar.mutate({
                vendedor_id: vendedorId,
                periodo_desde: desde,
                periodo_hasta: hasta,
              })
            }
            pending={generar.isPending}
          >
            Generar
          </TransactionButton>
        </div>
      </section>

      {/* Lista de liquidaciones como tarjetas, no tabla: cada monto en grande. */}
      {liquidaciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface px-4 py-14 text-center">
          <p className="text-sm font-medium text-text">Sin liquidaciones</p>
          <p className="text-xs text-text-subtle">
            Generá una para el período seleccionado y aparecerá acá.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {liquidaciones.map((l) => (
            <LiquidacionCard
              key={l.id}
              liq={l}
              onAprobar={() => aprobar.mutate(l.id)}
              onPagar={() => pagar.mutate(l.id)}
              pagando={pagar.isPending && pagar.variables === l.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function KpiTotal({
  label,
  value,
  count,
  intent,
}: {
  label: string;
  value: string;
  count: number;
  intent: "warn" | "pos";
}) {
  const strip = intent === "warn" ? "bg-warn" : "bg-pos";
  const moneyIntent = intent === "warn" ? "neutral" : "income";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div aria-hidden className={`absolute inset-y-0 left-0 w-1 ${strip}`} />
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
        <span className="text-xs text-text-subtle" style={MONO}>
          {count} {count === 1 ? "liquidación" : "liquidaciones"}
        </span>
      </div>
      <div className="mt-1.5 text-3xl font-bold leading-none">
        <MoneyText value={value} intent={moneyIntent} />
      </div>
    </div>
  );
}

function LiquidacionCard({
  liq,
  onAprobar,
  onPagar,
  pagando,
}: {
  liq: Liquidacion;
  onAprobar: () => void;
  onPagar: () => void;
  pagando: boolean;
}) {
  const pagada = esPagada(liq);
  const strip = pagada ? "bg-pos" : liq.estado === "aprobada" ? "bg-info" : "bg-warn";
  return (
    <li className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-xl border border-border bg-surface p-4 pl-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div aria-hidden className={`absolute inset-y-0 left-0 w-1 ${strip}`} />

      <div className="min-w-0 flex-1">
        <div className="text-2xl font-bold leading-none">
          <MoneyText value={liq.monto_total} intent={pagada ? "income" : "neutral"} />
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          <span style={MONO}>{liq.periodo_desde}</span>
          <span className="mx-1 text-text-subtle">→</span>
          <span style={MONO}>{liq.periodo_hasta}</span>
        </p>
      </div>

      <Badge tone={ESTADO_TONO[liq.estado] ?? "default"}>{labelEstado(liq.estado)}</Badge>

      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onAprobar}
          disabled={liq.estado !== "borrador"}
        >
          Aprobar
        </Button>
        <TransactionButton
          size="sm"
          onClick={onPagar}
          disabled={liq.estado !== "aprobada"}
          pending={pagando}
        >
          Pagar
        </TransactionButton>
      </div>
    </li>
  );
}

function LiquidacionesSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-7 w-40 animate-pulse rounded-md bg-surface-sunken" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-xl border border-border bg-surface-sunken" />
        <div className="h-24 animate-pulse rounded-xl border border-border bg-surface-sunken" />
      </div>
      <div className="h-32 animate-pulse rounded-xl border border-border bg-surface-sunken" />
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-xl border border-border bg-surface-sunken" />
        <div className="h-20 animate-pulse rounded-xl border border-border bg-surface-sunken" />
      </div>
    </div>
  );
}
