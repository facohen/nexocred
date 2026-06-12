import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { MoneyText } from "@/components/MoneyText";
import { useCajas } from "@/lib/api/queries";
import { useParadas } from "./hooks";
import { useRutaSync } from "./useOnline";
import { encolarVisita, contarPendientes, type VisitaEncolada } from "./queue";
import { VisitaCaptureForm } from "./VisitaCaptureForm";

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-2/3 animate-pulse rounded bg-foreground/10" />
      <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
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
        <h1 className="text-lg font-bold">La Ruta</h1>
        <div className="flex items-center gap-2">
          <Badge tone={online ? "success" : "warning"}>
            {online ? "En línea" : "Sin conexión"}
          </Badge>
          <span data-testid="sync-status" className="text-xs text-foreground/70">
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
          className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
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
          <p className="mt-1 text-xs text-amber-700">
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
          <span className="text-xs text-foreground/60">
            {ultimo.aplicadas} aplicadas · {ultimo.omitidas} omitidas · {ultimo.rechazadas} rechazadas
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {paradasQ.isLoading ? (
        <Skeleton />
      ) : paradasQ.isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          No se pudo cargar la ruta.
        </div>
      ) : paradas.length === 0 ? (
        <p className="text-sm text-foreground/60">No hay paradas asignadas.</p>
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
