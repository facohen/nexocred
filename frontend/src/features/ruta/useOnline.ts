import { useEffect, useState, useCallback, useRef } from "react";
import { sincronizarRuta, type ResultadoSync } from "./sync";
import { contarPendientes } from "./queue";
import { registrarBackgroundSync, soportaBackgroundSync } from "./sw-sync";

/** Intervalo de drenado de la cola mientras haya pendientes y conexión. */
const INTERVALO_DRENADO_MS = 30_000;

/** Reactive `navigator.onLine` with online/offline event subscriptions. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export interface SyncControlador {
  online: boolean;
  sincronizando: boolean;
  ultimo?: ResultadoSync;
  error?: string;
  sincronizarAhora: () => Promise<void>;
}

/**
 * Drives sync for a route. Strategy:
 *  - When supported, request a Background Sync (the SW replays in the background).
 *  - Always also wire the `online` event + window focus as a foreground fallback
 *    so browsers without Background Sync still converge.
 *  - Expose a manual `sincronizarAhora` for the "Sincronizar" button.
 * All three paths funnel through the same tested `sincronizarRuta`.
 */
export function useRutaSync(
  rutaId: string | undefined,
  cajaId?: string | null,
): SyncControlador {
  const online = useOnline();
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimo, setUltimo] = useState<ResultadoSync>();
  const [error, setError] = useState<string>();
  const enVuelo = useRef(false);
  // Keep the latest cajaId in a ref so the event-driven retries (online/focus/
  // visibility/interval) always sync with the currently selected caja without
  // re-subscribing the listeners on every change.
  const cajaRef = useRef<string | null | undefined>(cajaId);
  cajaRef.current = cajaId;

  const sincronizarAhora = useCallback(async () => {
    if (!rutaId || enVuelo.current) return;
    enVuelo.current = true;
    setSincronizando(true);
    setError(undefined);
    try {
      void registrarBackgroundSync();
      const res = await sincronizarRuta(rutaId, cajaRef.current);
      setUltimo(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de sincronización");
    } finally {
      enVuelo.current = false;
      setSincronizando(false);
    }
  }, [rutaId]);

  useEffect(() => {
    if (!rutaId) return;
    // Fallback triggers for browsers/webviews without (or in addition to)
    // Background Sync, several of which never fire 'online':
    //  - 'online' / 'focus': la conectividad/foco vuelve.
    //  - 'visibilitychange'→visible: la pestaña/webview vuelve al frente.
    //  - intervalo modesto: drena la cola mientras haya pendientes y conexión.
    const onOnline = () => void sincronizarAhora();
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void sincronizarAhora();
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    const intervalo = setInterval(() => {
      if (!navigator.onLine) return;
      void contarPendientes().then((n) => {
        if (n > 0) void sincronizarAhora();
      });
    }, INTERVALO_DRENADO_MS);

    // Best-effort: pre-register a Background Sync so the SW can replay later.
    if (soportaBackgroundSync()) void registrarBackgroundSync();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(intervalo);
    };
  }, [rutaId, sincronizarAhora]);

  return { online, sincronizando, ultimo, error, sincronizarAhora };
}
