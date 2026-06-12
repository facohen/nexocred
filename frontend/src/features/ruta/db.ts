import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** Estado de una visita en la cola local. */
export type EstadoCola = "pendiente" | "sincronizado" | "error";

/**
 * A captured visit/payment queued on the device. `id` is a device UUIDv7 and is
 * the primary key + idempotency identity. Money fields are ALWAYS strings.
 */
export interface VisitaEncolada {
  id: string;
  rutaId: string;
  paradaId: string;
  prestamoId: string;
  orden: number;
  resultado: string;
  montoCobrado: string | null;
  pagoId: string | null;
  fotoUrl: string | null;
  lat: string | null;
  lng: string | null;
  notas: string | null;
  visitadaEn: string;
}

export interface VisitaRow extends VisitaEncolada {
  estado: EstadoCola;
  motivoError?: string;
}

interface RutaDB extends DBSchema {
  visitas: {
    key: string;
    value: VisitaRow;
    indexes: { "by-ruta": string; "by-estado": EstadoCola };
  };
}

const DB_NAME = "nexocred-ruta";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RutaDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<RutaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RutaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("visitas", { keyPath: "id" });
        store.createIndex("by-ruta", "rutaId");
        store.createIndex("by-estado", "estado");
      },
    });
  }
  return dbPromise;
}

/** Test helper: wipe the store and reset the cached connection. */
export async function _resetDB(): Promise<void> {
  const db = await getDB();
  await db.clear("visitas");
}
