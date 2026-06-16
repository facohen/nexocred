import { useMemo, useState } from "react";
import { useProductos, useSimular } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/MoneyText";
import { ApiError } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export interface DatosPrestamo {
  productoId: string;
  productoNombre: string;
  monto: string;
  cantidadCuotas: number;
}

const moneyRegex = /^\d+(\.\d{1,2})?$/;
const TASA_INDICATIVA_DEFAULT = "0.30";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/**
 * Paso 2: producto, monto y cuotas + una cotización INDICATIVA (simulador libre,
 * no vinculante). Los números definitivos salen cuando un analista evalúe y
 * simule la oferta real sobre la solicitud. Por eso la tasa acá es editable y se
 * rotula como indicativa.
 */
export function StepPrestamo({
  valorInicial,
  onConfirmar,
  onVolver,
}: {
  valorInicial?: DatosPrestamo;
  onConfirmar: (datos: DatosPrestamo) => void;
  onVolver: () => void;
}) {
  const productosQ = useProductos();
  const productos = useMemo(() => productosQ.data?.data ?? [], [productosQ.data]);

  const [productoId, setProductoId] = useState(valorInicial?.productoId ?? "");
  const [monto, setMonto] = useState(valorInicial?.monto ?? "");
  const [cuotas, setCuotas] = useState<number | "">(valorInicial?.cantidadCuotas ?? "");
  const [tasa, setTasa] = useState(TASA_INDICATIVA_DEFAULT);

  const simular = useSimular();
  const [cotizacion, setCotizacion] = useState<components["schemas"]["SimuladorOut"] | null>(null);

  const producto = useMemo(
    () => productos.find((p) => p.id === productoId),
    [productos, productoId],
  );
  const plazos = producto?.plazos_permitidos ?? [];

  const montoValido = moneyRegex.test(monto) && monto !== "0";
  const cuotasValidas = typeof cuotas === "number" && cuotas > 0;
  const completo = Boolean(productoId) && montoValido && cuotasValidas;

  const cotizarError =
    simular.error instanceof ApiError
      ? simular.error.message
      : simular.error
        ? "No se pudo cotizar"
        : null;

  async function cotizar() {
    if (!completo) return;
    const fechaPrimera = new Date();
    fechaPrimera.setMonth(fechaPrimera.getMonth() + 1);
    try {
      const out = await simular.mutateAsync({
        tipo: "cotizador",
        body: {
          capital: monto,
          tasa_interes_directo: tasa,
          cantidad_cuotas: cuotas,
          periodicidad: producto?.periodicidad ?? "mensual",
          fecha_primera_cuota: fechaPrimera.toISOString().slice(0, 10),
        },
      });
      setCotizacion(out);
    } catch {
      setCotizacion(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-text">Condiciones del préstamo</h2>
        <p className="mt-0.5 text-sm text-text-muted">
          Definí producto, monto y plazo. Podés ver una cotización antes de continuar.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Producto" htmlFor="prod" className="sm:col-span-2">
            <select
              id="prod"
              value={productoId}
              onChange={(e) => {
                setProductoId(e.target.value);
                setCuotas("");
                setCotizacion(null);
              }}
              className={selectClass}
            >
              <option value="" disabled>
                Seleccionar producto…
              </option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            label="Monto"
            htmlFor="monto"
            hint={monto !== "" && !montoValido ? "Ingresá un número válido" : "En pesos"}
            error={monto !== "" && !montoValido}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-num text-sm text-text-subtle">
                $
              </span>
              <Input
                id="monto"
                inputMode="decimal"
                value={monto}
                onChange={(e) => {
                  setMonto(e.target.value);
                  setCotizacion(null);
                }}
                placeholder="100000.00"
                aria-invalid={monto !== "" && !montoValido}
                className="h-11 pl-7 font-num tabular-nums"
              />
            </div>
          </Campo>

          <Campo label="Cuotas" htmlFor="cuotas" hint="Cantidad de pagos">
            {plazos.length > 0 ? (
              <select
                id="cuotas"
                value={cuotas}
                onChange={(e) => {
                  setCuotas(Number(e.target.value));
                  setCotizacion(null);
                }}
                className={selectClass}
              >
                <option value="" disabled>
                  Seleccionar plazo…
                </option>
                {plazos.map((n) => (
                  <option key={n} value={n}>
                    {n} cuotas
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="cuotas"
                inputMode="numeric"
                value={cuotas}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCuotas(Number.isFinite(n) && n > 0 ? n : "");
                  setCotizacion(null);
                }}
                placeholder="6"
                className="h-11 font-num tabular-nums"
              />
            )}
          </Campo>

          <Campo
            label="Tasa indicativa"
            htmlFor="tasa"
            hint="Directa, no vinculante"
            className="sm:col-span-2"
          >
            <Input
              id="tasa"
              inputMode="decimal"
              value={tasa}
              onChange={(e) => {
                setTasa(e.target.value);
                setCotizacion(null);
              }}
              placeholder="0.30"
              className="h-11 font-num tabular-nums"
            />
          </Campo>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
          <Button variant="outline" onClick={cotizar} disabled={!completo || simular.isPending}>
            {simular.isPending ? "Cotizando…" : "Ver cotización indicativa"}
          </Button>
          <span className="text-xs text-text-subtle">
            La oferta definitiva la confirma un analista al evaluar.
          </span>
        </div>
      </div>

      {cotizarError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-neg-border bg-neg-bg px-4 py-3"
        >
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 h-4 w-4 shrink-0 text-neg"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-sm text-neg">{cotizarError}</p>
        </div>
      )}

      {cotizacion && <Cotizacion datos={cotizacion} />}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        <Button variant="ghost" onClick={onVolver}>
          ← Volver
        </Button>
        <Button
          disabled={!completo}
          onClick={() =>
            onConfirmar({
              productoId,
              productoNombre: producto?.nombre ?? "",
              monto,
              cantidadCuotas: cuotas as number,
            })
          }
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}

/* ── Cotización indicativa: totales destacados + plan de cuotas ───────────── */

function Cotizacion({ datos }: { datos: components["schemas"]["SimuladorOut"] }) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border bg-surface-sunken px-5 py-3">
        <h3 className="text-sm font-semibold text-text">Cotización indicativa</h3>
        <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[11px] font-medium text-brand">
          No vinculante
        </span>
      </header>

      <div className="grid grid-cols-3 divide-x divide-border">
        <Total label="Capital" value={datos.total_capital} />
        <Total label="Interés" value={datos.total_interes} acento />
        <Total label="Total" value={datos.total_a_pagar} fuerte />
      </div>

      <div className="border-t border-border px-5 py-3">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-text-subtle">
          <span>Plan de cuotas</span>
          <span className="font-num tabular-nums normal-case">{datos.cuotas.length} cuotas</span>
        </div>
        <ul className="max-h-56 space-y-px overflow-y-auto">
          {datos.cuotas.map((c) => (
            <li
              key={c.numero}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface-sunken"
            >
              <span className="flex items-center gap-2 text-text-muted">
                <span className="font-num tabular-nums text-xs text-text-subtle">
                  #{String(c.numero).padStart(2, "0")}
                </span>
                <span className="text-xs">{c.vencimiento}</span>
              </span>
              <MoneyText value={c.cuota} intent="neutral" className="text-text" />
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Total({
  label,
  value,
  acento = false,
  fuerte = false,
}: {
  label: string;
  value: string;
  acento?: boolean;
  fuerte?: boolean;
}) {
  return (
    <div className="px-4 py-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
        {label}
      </div>
      <div className="mt-1.5">
        <MoneyText
          value={value}
          intent="neutral"
          className={[
            "block leading-none",
            fuerte ? "text-lg font-semibold" : "text-base font-medium",
            acento ? "text-warn" : "",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

/* ── Campo de formulario con label + hint ─────────────────────────────────── */

function Campo({
  label,
  htmlFor,
  hint,
  error = false,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={["space-y-1.5", className].filter(Boolean).join(" ")}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-text">
        {label}
      </label>
      {children}
      {hint && (
        <p className={["text-xs", error ? "text-neg" : "text-text-subtle"].join(" ")}>{hint}</p>
      )}
    </div>
  );
}
