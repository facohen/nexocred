import { useEffect, useState, useCallback, useRef } from "react";
import { sincronizarRuta, type ResultadoSync } from "./sync";
import { registrarBackgroundSync, soportaBackgroundSync } from "./sw-sync";

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
    // Fallback trigger for browsers without (or in addition to) Background Sync.
    const onOnline = () => void sincronizarAhora();
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    // Best-effort: pre-register a Background Sync so the SW can replay later.
    if (soportaBackgroundSync()) void registrarBackgroundSync();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
    };
  }, [rutaId, sincronizarAhora]);

  return { online, sincronizando, ultimo, error, sincronizarAhora };
}
