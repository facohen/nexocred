import { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { MoneyText } from "@/components/MoneyText";
import { addMoney } from "@/lib/money";
import { useCajas } from "@/lib/api/queries";
import { useParadas } from "./hooks";
import type { components } from "@/lib/api/schema";

type Parada = components["schemas"]["ParadaConSaldoOut"];
import { useRutaSync } from "./useOnline";
import { encolarVisita, contarPendientes, type VisitaEncolada } from "./queue";
import { VisitaCaptureForm } from "./VisitaCaptureForm";

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-sunken" />
      <div className="h-4 w-full animate-pulse rounded bg-surface-sunken" />
    </div>
  );
}

/**
 * La Ruta — the cobrador's offline-first field screen. Loads the assigned route,
 * lists stops with their exigible saldo, captures visits into the IndexedDB
 * queue, and shows live sync status. Offline submits only enqueue; online
 * submits enqueue + sync. Mobile-first (max-w container, stacked cards).
 */
export function RutaPage({ rutaId }: { rutaId: string }) {
  const paradasQ = useParadas(rutaId);
  const cajasQ = useCajas();
  const cajas = (cajasQ.data?.data ?? []).filter((c) => c.activo);
  // El cobrador elige su caja para la ruta; viaja en cada sync (caja_id). Sin
  // ella el backend rechaza los cobros con 422 caja_requerida.
  const [cajaId, setCajaId] = useState<string>("");
  const { online, sincronizando, ultimo, error, sincronizarAhora } = useRutaSync(
    rutaId,
    cajaId || undefined,
  );
  const [pendientes, setPendientes] = useState(0);
  const [capturando, setCapturando] = useState<string | null>(null);

  const refrescarPendientes = useCallback(async () => {
    setPendientes(await contarPendientes());
  }, []);

  useEffect(() => {
    void refrescarPendientes();
  }, [refrescarPendientes, ultimo]);

  const onGuardar = useCallback(
    async (v: VisitaEncolada) => {
      await encolarVisita(v);
      await refrescarPendientes();
      setCapturando(null);
      // Online → enqueue + sync; offline → enqueue only (no POST).
      if (online) {
        await sincronizarAhora();
        await refrescarPendientes();
      }
    },
    [online, sincronizarAhora, refrescarPendientes],
  );

  const paradas = paradasQ.data?.data ?? [];

  return (
    <div data-testid="ruta-root" className="mx-auto max-w-md space-y-4 px-1 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Ruta de Cobranza</h1>
        <div className="flex items-center gap-2">
          <Badge tone={online ? "success" : "warning"}>
            {online ? "En línea" : "Sin conexión"}
          </Badge>
          <span data-testid="sync-status" className="text-xs text-text-muted">
            {pendientes} pendiente{pendientes === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <div>
        <label htmlFor="caja" className="text-sm font-medium">
          Caja
        </label>
        <select
          id="caja"
          className="mt-1 h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
          value={cajaId}
          onChange={(e) => setCajaId(e.target.value)}
        >
          <option value="">Seleccioná una caja…</option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {!cajaId && (
          <p className="mt-1 text-xs text-warn">
            Seleccioná una caja para poder sincronizar los cobros de la ruta.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <TransactionButton
          size="sm"
          variant="outline"
          onClick={() => void sincronizarAhora()}
          disabled={pendientes === 0}
          pending={sincronizando}
        >
          {sincronizando ? "Sincronizando…" : "Sincronizar"}
        </TransactionButton>
        {ultimo?.enviado && (
          <span className="text-xs text-text-muted">
            {ultimo.aplicadas} aplicadas · {ultimo.omitidas} omitidas · {ultimo.rechazadas} rechazadas
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-neg-border bg-neg-bg p-2 text-sm text-neg">
          {error}
        </div>
      )}

      {!paradasQ.isLoading && !paradasQ.isError && <RutaResumen paradas={paradas} />}

      {paradasQ.isLoading ? (
        <Skeleton />
      ) : paradasQ.isError ? (
        <div role="alert" className="rounded-lg border border-neg-border bg-neg-bg p-2 text-sm text-neg">
          No se pudo cargar la ruta.
        </div>
      ) : paradas.length === 0 ? (
        <p className="text-sm text-text-muted">No hay paradas asignadas.</p>
      ) : (
        <ol className="space-y-3">
          {paradas.map((p) => (
            <li key={p.id}>
              <Card className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{`#${p.orden} · Préstamo ${p.prestamo_id}`}</span>
                  <MoneyText value={p.saldo_exigible} className="text-sm font-semibold" />
                </div>
                {capturando === p.id ? (
                  <VisitaCaptureForm
                    parada={p}
                    rutaId={rutaId}
                    onGuardar={onGuardar}
                    onCancelar={() => setCapturando(null)}
                  />
                ) : p.resultado ? (
                  // Visitada: se puede re-abrir para corregir. La corrección crea
                  // una NUEVA entrada de cola con device id + pago_id frescos
                  // (encolarVisita es idempotente por id, así que reusar el id se
                  // descartaría; el backend trata mismo pago_id+otro monto como
                  // 409 → por eso siempre minteamos ids nuevos). Spec §5.5.7.
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="success">Visitada: {p.resultado}</Badge>
                    <Button size="sm" variant="outline" onClick={() => setCapturando(p.id)}>
                      Corregir
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setCapturando(p.id)}>
                    Registrar visita
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Cabecera-dashboard del día del cobrador: se deriva de las paradas ya cargadas
// (sin query ni backend nuevos) y NO toca la lógica offline/IndexedDB.
function RutaResumen({ paradas }: { paradas: Parada[] }) {
  const r = useMemo(() => {
    const total = paradas.length;
    const hechas = paradas.filter((p) => p.resultado != null).length;
    const promesas = paradas.filter((p) => p.resultado === "promesa").length;
    const objetivo = paradas.reduce((acc, p) => addMoney(acc, p.saldo_exigible ?? "0"), "0");
    const cobrado = paradas.reduce((acc, p) => addMoney(acc, p.monto_cobrado ?? "0"), "0");
    return { total, hechas, promesas, objetivo, cobrado };
  }, [paradas]);

  if (r.total === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2" aria-label="Resumen del día">
      <Card className="p-3">
        <div className="text-xs text-text-muted">Cobrado del día</div>
        <MoneyText value={r.cobrado} intent="income" className="text-base font-semibold" />
        <div className="text-xs text-text-subtle">
          objetivo <MoneyText value={r.objetivo} withSymbol={false} />
        </div>
      </Card>
      <Card className="p-3">
        <div className="text-xs text-text-muted">Paradas</div>
        <div className="text-base font-semibold tabular-nums text-text">
          {r.hechas}/{r.total}
        </div>
        <div className="text-xs text-text-subtle">
          {r.total - r.hechas} pendiente{r.total - r.hechas === 1 ? "" : "s"}
          {r.promesas > 0 ? ` · ${r.promesas} promesa${r.promesas === 1 ? "" : "s"}` : ""}
        </div>
      </Card>
    </div>
  );
}
