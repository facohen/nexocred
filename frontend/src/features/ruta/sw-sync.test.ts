import { describe, it, expect, vi } from "vitest";
import { soportaBackgroundSync, registrarBackgroundSync } from "./sw-sync";

describe("Background Sync (feature-detected)", () => {
  it("detecta soporte ausente en jsdom y no rompe", async () => {
    // jsdom no implementa SyncManager → debe reportar no-soportado.
    expect(soportaBackgroundSync()).toBe(false);
    // registrar no debe lanzar cuando no hay soporte; devuelve false.
    await expect(registrarBackgroundSync()).resolves.toBe(false);
  });

  it("registra el sync tag cuando el SW lo soporta", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const fakeReg = { sync: { register } } as unknown as ServiceWorkerRegistration;
    const ok = await registrarBackgroundSync(fakeReg);
    expect(ok).toBe(true);
    expect(register).toHaveBeenCalledWith("ruta-sync");
  });
});
