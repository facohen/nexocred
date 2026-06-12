import { getDB, _resetDB, type VisitaEncolada, type VisitaRow, type EstadoCola } from "./db";
import type { components } from "@/lib/api/schema";

export type { VisitaEncolada, VisitaRow, EstadoCola };

type SyncIn = components["schemas"]["SyncIn"];

/**
 * Pure offline-queue logic for La Ruta, sitting over IndexedDB (idb). Every
 * function here is deterministic and unit-tested with fake-indexeddb — no
 * service worker, no network. The Background Sync API (production) and the
 * manual "Sincronizar" button both call into sincronizarRuta (sync.ts) which
 * builds its batch from construirBatch below.
 */

/**
 * Enqueue a captured visit. Keyed by the device UUIDv7 id, so re-enqueuing the
 * SAME id is idempotent (a double-tap or a replay does not create a second
 * row). A fresh enqueue always lands as 'pendiente'.
 */
export async function encolarVisita(v: VisitaEncolada): Promise<void> {
  const db = await getDB();
  const existing = await db.get("visitas", v.id);
  if (existing) return; // idempotente por device id
  const row: VisitaRow = { ...v, estado: "pendiente" };
  await db.put("visitas", row);
}

/** Visits still awaiting a successful sync. */
export async function listarPendientes(): Promise<VisitaRow[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("visitas", "by-estado", "pendiente");
  return all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function contarPendientes(): Promise<number> {
  return (await listarPendientes()).length;
}

/** Flip a queued visit to synced (server accepted/idempotently skipped it). */
export async function marcarSincronizado(id: string): Promise<void> {
  const db = await getDB();
  const row = await db.get("visitas", id);
  if (!row) return;
  await db.put("visitas", { ...row, estado: "sincronizado", motivoError: undefined });
}

/** Mark a queued visit as rejected; it stays in the store with the reason. */
export async function marcarError(id: string, motivo: string): Promise<void> {
  const db = await getDB();
  const row = await db.get("visitas", id);
  if (!row) return;
  await db.put("visitas", { ...row, estado: "error", motivoError: motivo });
}

/**
 * True when a queued visit carries a cobro the backend will APPLY (and thus
 * requires a caja_id). Mirrors the backend `_trae_cobro`: a payment identity
 * (pago_id) plus a monto. Visits without a cobro (ausente/rechazo/promesa) can
 * sync without a caja.
 */
export function traeCobro(v: VisitaEncolada): boolean {
  return v.pagoId != null && v.montoCobrado != null;
}

/**
 * Build the POST /rutas/{id}/sync payload from the pending queue for one route.
 * Device ids and pago_ids travel verbatim (UUIDv7 identity); money stays a
 * string. Replaying this batch is safe because the backend keys on these ids.
 *
 * `cajaId` is the cobrador's selected caja for the route. The backend
 * (sync.py:162) raises 422 'caja_requerida' when applying a NEW cobro with
 * caja_id=None, so it MUST travel whenever the batch carries a payment.
 */
export async function construirBatch(rutaId: string, cajaId?: string | null): Promise<SyncIn> {
  const pendientes = (await listarPendientes()).filter((v) => v.rutaId === rutaId);
  return {
    caja_id: cajaId ?? null,
    paradas: pendientes.map((v) => ({
      id: v.id,
      prestamo_id: v.prestamoId,
      orden: v.orden,
      resultado: v.resultado,
      monto_cobrado: v.montoCobrado,
      foto_url: v.fotoUrl,
      lat: v.lat,
      lng: v.lng,
      notas: v.notas,
      visitada_en: v.visitadaEn,
      pago_id: v.pagoId,
    })),
  };
}

/** Test-only reset of the IndexedDB store. */
export async function _reset(): Promise<void> {
  await _resetDB();
}
