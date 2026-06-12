/**
 * Background Sync glue for La Ruta.
 *
 * PRODUCTION TRIGGER: a service worker listens for the `ruta-sync` sync tag and,
 * when connectivity returns, replays the queue via the SAME `sincronizarRuta`
 * that the manual button and the online-event fallback call. This module only
 * does feature-detected registration — it never owns the sync logic, which is
 * pure and unit-tested (queue.ts/sync.ts) with fake-indexeddb + MSW. Browsers
 * without Background Sync fall back to the `online`/focus retry in useOnline.
 *
 * The actual SW script is registered by vite-plugin-pwa; here we just request a
 * one-off sync. We do NOT depend on a real service worker in tests.
 */

export const RUTA_SYNC_TAG = "ruta-sync";

/** True when the browser exposes the Background Sync API. */
export function soportaBackgroundSync(): boolean {
  return (
    typeof self !== "undefined" &&
    "ServiceWorkerRegistration" in self &&
    "sync" in (self as { ServiceWorkerRegistration: { prototype: object } }).ServiceWorkerRegistration
      .prototype
  );
}

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

/**
 * Request a one-off Background Sync. Returns true if the sync was registered.
 * Feature-detected and safe to call when unsupported (returns false). A
 * registration may be injected for testing.
 */
export async function registrarBackgroundSync(
  registration?: ServiceWorkerRegistration,
): Promise<boolean> {
  try {
    const reg = (registration ?? (await resolverRegistration())) as
      | SyncCapableRegistration
      | undefined;
    if (!reg?.sync) return false;
    await reg.sync.register(RUTA_SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

async function resolverRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;
  if (!soportaBackgroundSync()) return undefined;
  return navigator.serviceWorker.ready;
}
