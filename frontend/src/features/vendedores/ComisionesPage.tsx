import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import { addMoney, subMoney, compareMoney } from "@/lib/money";
import { formatRatioPercent } from "@/features/riesgo/format";
import { useComisiones } from "./hooks";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const ESTADOS = ["devengada", "confirmada", "clawback", "liquidada"] as const;
type Estado = (typeof ESTADOS)[number];

/** Etiquetas visibles al usuario; el estado técnico ("clawback") no se toca. */
const ESTADO_LABEL: Record<string, string> = {
  clawback: "Reversión de Comisión",
};
const labelEstado = (estado: string) => ESTADO_LABEL[estado] ?? estado;

/** Etiqueta corta para las micro-barras del desglose (no rompe el ancho fijo). */
const ESTADO_LABEL_CORTO: Record<Estado, string> = {
  devengada: "Devengadas",
  confirmada: "Confirmadas",
  clawback: "Reversiones",
  liquidada: "Liquidadas",
};

// Cada estado tiene una intención de color: las reversiones restan (neg), las
// liquidadas ya están cobradas (pos), el resto es brand/warn según madurez.
const ESTADO_INTENT: Record<Estado, "brand" | "pos" | "warn" | "neg"> = {
  devengada: "warn",
  confirmada: "brand",
  liquidada: "pos",
  clawback: "neg",
};

const BAR_BG: Record<"brand" | "pos" | "warn" | "neg", string> = {
  brand: "bg-brand",
  pos: "bg-pos",
  warn: "bg-warn",
  neg: "bg-neg",
};

const isClawback = (estado: string) => estado === "clawback";

/** Comisiones de un vendedor agrupadas por estado. Plata siempre en string. */
export function ComisionesPage({ vendedorId }: { vendedorId: string }) {
  const q = useComisiones(vendedorId);
  const [foco, setFoco] = useState<Estado | "todas">("todas");

  const comisiones = useMemo(() => q.data ?? [], [q.data]);

  // Totales por estado vía suma de strings en centavos (sin float).
  const totales = useMemo(
    () =>
      ESTADOS.map((estado) => ({
        estado,
        total: comisiones
          .filter((c) => c.estado === estado)
          .reduce((acc, c) => addMoney(acc, c.monto ?? "0.00"), "0.00"),
        count: comisiones.filter((c) => c.estado === estado).length,
      })),
    [comisiones],
  );

  // Total "ganado del mes": no-reversiones suman; las reversiones restan su
  // MAGNITUD. El backend puede mandar el clawback ya en negativo o en positivo;
  // normalizamos a magnitud positiva y siempre restamos, sin doble signo.
  const totalNeto = useMemo(
    () =>
      comisiones.reduce((acc, c) => {
        const monto = c.monto ?? "0.00";
        if (!isClawback(c.estado)) return addMoney(acc, monto);
        const magnitud = compareMoney(monto, "0.00") < 0 ? subMoney("0.00", monto) : monto;
        return subMoney(acc, magnitud);
      }, "0.00"),
    [comisiones],
  );

  // Mayor total positivo para escalar las micro-barras del breakdown.
  const maxTotal = useMemo(
    () =>
      totales
        .filter((t) => !isClawback(t.estado))
        .reduce((max, t) => (compareMoney(t.total, max) > 0 ? t.total : max), "0.01"),
    [totales],
  );

  const filtradas = useMemo(
    () => (foco === "todas" ? comisiones : comisiones.filter((c) => c.estado === foco)),
    [comisiones, foco],
  );

  if (q.isLoading) return <ComisionesSkeleton />;
  if (q.isError)
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudieron cargar las comisiones.
      </p>
    );

  return (
    <div className="space-y-6">
      {/* HERO asimétrico: cifra neta dominante a la izquierda, desglose a la derecha. */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-pos" />
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Comisiones netas del período
          </p>
          <div className="mt-2 text-4xl font-bold leading-none">
            <MoneyText value={totalNeto} intent="income" />
          </div>
          <p className="mt-3 text-xs text-text-subtle">
            <span style={MONO}>{comisiones.length}</span>{" "}
            {comisiones.length === 1 ? "comisión registrada" : "comisiones registradas"} ·
            confirmadas y liquidadas menos reversiones
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-text-muted">
            Por estado
          </p>
          <ul className="space-y-3">
            {totales.map(({ estado, total, count }) => {
              const intent = ESTADO_INTENT[estado];
              const width = isClawback(estado) ? "100%" : `${pctOf(total, maxTotal)}%`;
              return (
                <li key={estado} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
                  <span className="truncate text-sm text-text">{ESTADO_LABEL_CORTO[estado]}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${BAR_BG[intent]}`}
                      style={{ width, opacity: isClawback(estado) ? 0.55 : 1 }}
                    />
                  </div>
                  <span className="text-right text-sm font-semibold">
                    <span data-testid={`total-${estado}`}>
                      <MoneyText value={total} intent={isClawback(estado) ? "expense" : "income"} />
                    </span>
                    <span className="ml-2 text-xs text-text-subtle" style={MONO}>
                      {count}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Selector de estado como pill-toggles. */}
      <div className="flex flex-wrap items-center gap-2">
        <PillToggle active={foco === "todas"} onClick={() => setFoco("todas")}>
          Todas
        </PillToggle>
        {ESTADOS.map((estado) => (
          <PillToggle key={estado} active={foco === estado} onClick={() => setFoco(estado)}>
            {labelEstado(estado)}
          </PillToggle>
        ))}
      </div>

      {/* Detalle por préstamo. */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-12 text-center">
            <p className="text-sm font-medium text-text">Nada por acá todavía</p>
            <p className="text-xs text-text-subtle">
              No hay comisiones en este estado para el período.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-subtle">
                <th className="px-4 py-2 font-medium">Préstamo</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 text-right font-medium">%</th>
                <th className="px-4 py-2 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-sunken"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-text-muted" style={MONO}>
                      {c.prestamo_id.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={isClawback(c.estado) ? "danger" : "default"}>
                      {labelEstado(c.estado)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 capitalize text-text-muted">{c.tipo ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right text-text-muted" style={MONO}>
                    {formatRatioPercent(c.porcentaje)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <MoneyText
                      value={c.monto}
                      intent={isClawback(c.estado) ? "expense" : "income"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PillToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        active
          ? "bg-brand text-brand-foreground shadow-sm"
          : "border border-border bg-surface text-text-muted hover:border-border-strong hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ComisionesSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="h-36 animate-pulse rounded-xl border border-border bg-surface-sunken" />
        <div className="h-36 animate-pulse rounded-xl border border-border bg-surface-sunken" />
      </div>
      <div className="h-9 w-72 animate-pulse rounded-full bg-surface-sunken" />
      <div className="h-48 animate-pulse rounded-xl border border-border bg-surface-sunken" />
    </div>
  );
}

/** Porcentaje entero (0–100) de `value` sobre `max`, en centavos, sin float. */
function pctOf(value: string, max: string): number {
  const toCents = (s: string): bigint => {
    const neg = s.startsWith("-");
    const [i, f = "0"] = (neg ? s.slice(1) : s).split(".");
    const cents = BigInt(i || "0") * 100n + BigInt((f + "00").slice(0, 2));
    return neg ? -cents : cents;
  };
  const v = toCents(value);
  const m = toCents(max);
  if (m <= 0n || v <= 0n) return 0;
  const pct = Number((v * 100n) / m);
  return Math.min(100, Math.max(2, pct));
}
