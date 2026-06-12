import { apiFetch, ApiError } from "@/lib/api/client";
import {
  construirBatch,
  listarPendientes,
  marcarSincronizado,
  marcarError,
  type VisitaRow,
} from "./queue";
import type { components } from "@/lib/api/schema";

type SyncOut = components["schemas"]["SyncOut"];

export interface ResultadoSync {
  enviado: boolean;
  aplicadas: number;
  omitidas: number;
  rechazadas: number;
  /**
   * Paradas posteadas que el backend NO reconoció con un veredicto convergente
   * (estado desconocido, o ausentes de items[]). Quedan PENDIENTES para
   * reintento y NO se cuentan como aplicadas. > 0 indica un desajuste a vigilar.
   */
  noReconciliadas: number;
}

/** Estados del backend que dan por convergida (sincronizada) una parada. */
const ESTADOS_OK = new Set(["aplicada", "omitida"]);

/**
 * Replay the offline queue for one route to the backend and reconcile each item.
 *
 * This is the SINGLE sync entry point — called by:
 *  - the manual "Sincronizar" button,
 *  - the `online` event / on-focus / visibilitychange retry (useOnline),
 *  - the Background Sync service worker (sw-sync) in production.
 *
 * Idempotency: the batch carries each visit's device UUIDv7 id. The backend
 * keys on that id, so a replayed sync returns `omitida` for already-applied
 * stops/payments — never a duplicate.
 *
 * Reconciliation is driven STRICTLY by the per-item list (never the aggregate
 * counters):
 *  - estado ∈ {aplicada, omitida} → sincronizado
 *  - estado == rechazada          → error (stays queued with the reason)
 *  - cualquier otro estado        → se deja PENDIENTE (no se descarta la fila)
 *  - parada posteada ausente de items[] → se deja PENDIENTE (desajuste)
 *
 * Atomicidad del batch: el backend procesa el batch en UNA transacción y puede
 * abortar a mitad (409 pago_inmutable / 422 caja_requerida) revirtiendo todo.
 * En ese caso el POST lanza ApiError ANTES de cualquier marca: la cola queda
 * intacta (todo pendiente) y el error específico se propaga al operador. Si el
 * error identifica un pago_id ofensor lo marcamos como error y dejamos el resto
 * pendiente. Money is never parsed to a number.
 */
export async function sincronizarRuta(rutaId: string): Promise<ResultadoSync> {
  const pendientes = (await listarPendientes()).filter((v) => v.rutaId === rutaId);
  if (pendientes.length === 0) {
    return { enviado: false, aplicadas: 0, omitidas: 0, rechazadas: 0, noReconciliadas: 0 };
  }

  const batch = await construirBatch(rutaId);
  const posteadas = pendientes.map((v) => v.id);

  let out: SyncOut;
  try {
    out = await apiFetch<SyncOut>(`/rutas/${rutaId}/sync`, {
      method: "POST",
      body: batch,
    });
  } catch (e) {
    // MAJOR 1: el POST falló (batch atómico revertido). NO marcamos nada
    // sincronizado. Si el error apunta a un pago_id concreto, marcamos SOLO esa
    // fila como error (para que el operador la corrija) y dejamos el resto
    // pendiente. Luego re-lanzamos para que el mensaje específico llegue arriba.
    if (e instanceof ApiError) {
      await marcarItemOfensor(e, pendientes);
    }
    throw e;
  }

  // MAJOR 2 + MAJOR 3: reconciliación dirigida por la lista per-item, nunca por
  // los counters agregados.
  const acusadas = new Set<string>();
  let noReconciliadas = 0;

  for (const item of out.items) {
    acusadas.add(item.parada_id);
    if (ESTADOS_OK.has(item.estado)) {
      await marcarSincronizado(item.parada_id);
    } else if (item.estado === "rechazada") {
      await marcarError(item.parada_id, item.estado);
    } else {
      // Estado inesperado: NO se descarta la fila, queda pendiente para revisión.
      noReconciliadas += 1;
      console.warn(
        `[ruta-sync] estado desconocido '${item.estado}' para parada ${item.parada_id}; se deja pendiente`,
      );
    }
  }

  // MAJOR 3: toda parada posteada debe estar en items[]. Las no acusadas quedan
  // pendientes (no confiamos en los counters que podrían decir que se aplicaron).
  for (const id of posteadas) {
    if (!acusadas.has(id)) {
      noReconciliadas += 1;
      console.warn(
        `[ruta-sync] parada ${id} posteada pero ausente en items[]; se deja pendiente`,
      );
    }
  }

  return {
    enviado: true,
    aplicadas: out.aplicadas,
    omitidas: out.omitidas,
    rechazadas: out.rechazadas ?? 0,
    noReconciliadas,
  };
}

/**
 * Si un ApiError identifica un pago_id (o parada_id) ofensor en `details`, marca
 * esa fila concreta como error para que el operador la corrija; el resto de la
 * cola queda pendiente intacto.
 */
async function marcarItemOfensor(e: ApiError, pendientes: VisitaRow[]): Promise<void> {
  const det = e.details;
  if (!det) return;
  const pagoId = typeof det.pago_id === "string" ? det.pago_id : undefined;
  const paradaId = typeof det.parada_id === "string" ? det.parada_id : undefined;
  const ofensor = pendientes.find(
    (v) => (pagoId && v.pagoId === pagoId) || (paradaId && v.id === paradaId),
  );
  if (ofensor) {
    await marcarError(ofensor.id, `${e.code}: ${e.message}`);
  }
}
