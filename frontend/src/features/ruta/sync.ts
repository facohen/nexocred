import { apiFetch } from "@/lib/api/client";
import { construirBatch, listarPendientes, marcarSincronizado, marcarError } from "./queue";
import type { components } from "@/lib/api/schema";

type SyncOut = components["schemas"]["SyncOut"];

export interface ResultadoSync {
  enviado: boolean;
  aplicadas: number;
  omitidas: number;
  rechazadas: number;
}

/**
 * Replay the offline queue for one route to the backend and reconcile each item.
 *
 * This is the SINGLE sync entry point — called by:
 *  - the manual "Sincronizar" button,
 *  - the `online` event / on-focus retry (useOnline),
 *  - the Background Sync service worker (sw-sync) in production.
 *
 * Idempotency: the batch carries each visit's device UUIDv7 id. The backend
 * keys on that id, so a replayed sync returns `omitida` for already-applied
 * stops/payments — never a duplicate. We mark each queued row by the server's
 * per-item verdict: aplicada/omitida → sincronizado; rechazada → error (stays
 * queued with the reason for manual review). Money is never parsed to a number.
 */
export async function sincronizarRuta(rutaId: string): Promise<ResultadoSync> {
  const pendientes = (await listarPendientes()).filter((v) => v.rutaId === rutaId);
  if (pendientes.length === 0) {
    return { enviado: false, aplicadas: 0, omitidas: 0, rechazadas: 0 };
  }

  const batch = await construirBatch(rutaId);
  const out = await apiFetch<SyncOut>(`/rutas/${rutaId}/sync`, {
    method: "POST",
    body: batch,
  });

  for (const item of out.items) {
    if (item.estado === "rechazada") {
      await marcarError(item.parada_id, item.estado);
    } else {
      // aplicada u omitida (idempotente) → la cola converge a sincronizado.
      await marcarSincronizado(item.parada_id);
    }
  }

  return {
    enviado: true,
    aplicadas: out.aplicadas,
    omitidas: out.omitidas,
    rechazadas: out.rechazadas ?? 0,
  };
}
