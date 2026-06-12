import { describe, it, expect } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { setToken, setSessionUser } from "@/lib/auth";

// These MSW handlers back the F1c/F1d screens with no backend. Money fields are
// always strings; we assert the contract shapes the dashboards consume.
function auth() {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ email: "admin@nexocred.test", nombre: "Admin", roles: ["admin"] });
}

describe("MSW f1c/f1d handlers", () => {
  it("resuelve GET /torre/pulso con tarjetas y money strings", async () => {
    auth();
    const pulso = await apiFetch<{ tiene_snapshot: boolean; tarjetas: { clave: string; valor: string }[] }>(
      "/torre/pulso",
    );
    expect(pulso.tiene_snapshot).toBe(true);
    expect(pulso.tarjetas.length).toBeGreaterThan(0);
    expect(typeof pulso.tarjetas[0].valor).toBe("string");
  });

  it("resuelve GET /riesgo/tablero con par y aging string", async () => {
    auth();
    const t = await apiFetch<{ par30: string; cartera_total: string; aging: Record<string, string> }>(
      "/riesgo/tablero",
    );
    expect(typeof t.par30).toBe("string");
    expect(typeof t.cartera_total).toBe("string");
  });

  it("resuelve GET /rutas (lista del cobrador)", async () => {
    auth();
    const r = await apiFetch<{ data: { id: string; estado: string }[] }>("/rutas");
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length).toBeGreaterThan(0);
  });

  it("resuelve GET /documentos/{id} con numero + hash", async () => {
    auth();
    const d = await apiFetch<{ id: string; numero: number; hash_sha256: string }>(
      "/documentos/doc-1",
    );
    expect(d.numero).toBeGreaterThan(0);
    expect(d.hash_sha256.length).toBeGreaterThan(0);
  });

  it("resuelve POST /rutas/{id}/sync devolviendo items reconciliados", async () => {
    auth();
    const out = await apiFetch<{ aplicadas: number; items: { parada_id: string; estado: string }[] }>(
      "/rutas/ruta-1/sync",
      { method: "POST", body: { paradas: [{ id: "uuidv7-1", prestamo_id: "L1", orden: 1, resultado: "pago" }] } },
    );
    expect(out.items[0].estado).toBe("aplicada");
  });

  it("torre/pulso vacío cuando no hay snapshot", async () => {
    auth();
    const pulso = await apiFetch<{ tiene_snapshot: boolean }>("/torre/pulso", {
      query: { vacio: "1" },
    });
    expect(pulso.tiene_snapshot).toBe(false);
  });
});
