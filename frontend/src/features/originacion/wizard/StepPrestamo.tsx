import { useMemo, useState } from "react";
import { useProductos, useSimular } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-text">Condiciones del préstamo</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium text-text">Producto</span>
          <select
            value={productoId}
            onChange={(e) => {
              setProductoId(e.target.value);
              setCuotas("");
              setCotizacion(null);
            }}
            className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
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
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-text">Monto</span>
          <Input
            inputMode="decimal"
            value={monto}
            onChange={(e) => {
              setMonto(e.target.value);
              setCotizacion(null);
            }}
            placeholder="100000.00"
            aria-invalid={monto !== "" && !montoValido}
          />
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-text">Cuotas</span>
          {plazos.length > 0 ? (
            <select
              value={cuotas}
              onChange={(e) => {
                setCuotas(Number(e.target.value));
                setCotizacion(null);
              }}
              className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
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
              inputMode="numeric"
              value={cuotas}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCuotas(Number.isFinite(n) && n > 0 ? n : "");
                setCotizacion(null);
              }}
              placeholder="6"
            />
          )}
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-text">Tasa indicativa (directa)</span>
          <Input
            inputMode="decimal"
            value={tasa}
            onChange={(e) => {
              setTasa(e.target.value);
              setCotizacion(null);
            }}
            placeholder="0.30"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={cotizar} disabled={!completo || simular.isPending}>
          {simular.isPending ? "Cotizando…" : "Ver cotización indicativa"}
        </Button>
        <span className="text-xs text-text-subtle">
          La oferta definitiva la confirma un analista al evaluar.
        </span>
      </div>

      {cotizarError && (
        <p role="alert" className="text-sm text-neg">
          {cotizarError}
        </p>
      )}

      {cotizacion && (
        <Card>
          <CardTitle>Cotización indicativa</CardTitle>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Resumen label="Capital" value={cotizacion.total_capital} />
            <Resumen label="Interés" value={cotizacion.total_interes} />
            <Resumen label="Total a pagar" value={cotizacion.total_a_pagar} />
          </div>
          <ul className="mt-3 divide-y divide-border text-sm">
            {cotizacion.cuotas.map((c) => (
              <li key={c.numero} className="flex justify-between py-1.5">
                <span className="text-text-muted">
                  #{c.numero} · {c.vencimiento}
                </span>
                <MoneyText value={c.cuota} intent="neutral" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
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

function Resumen({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-sunken p-2">
      <div className="text-xs text-text-subtle">{label}</div>
      <MoneyText value={value} intent="neutral" className="font-semibold" />
    </div>
  );
}
