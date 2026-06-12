import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { encolarVisita, listarPendientes, _reset, type VisitaEncolada } from "./queue";
import { getDB } from "./db";
import { sincronizarRuta } from "./sync";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "http://localhost/api/v1";

function authCobrador() {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ email: "cobrador@nexocred.test", nombre: "Cobra", roles: ["cobrador"] });
}

const visita = (over: Partial<VisitaEncolada> = {}): VisitaEncolada => ({
  id: "uuidv7-1",
  rutaId: "ruta-1",
  paradaId: "p1",
  prestamoId: "L1",
  orden: 1,
  resultado: "pago",
  montoCobrado: "2200.00",
  pagoId: "uuidv7-pago-1",
  fotoUrl: null,
  lat: null,
  lng: null,
  notas: null,
  visitadaEn: "2026-06-12T10:00:00Z",
  ...over,
});

describe("sincronizarRuta", () => {
  beforeEach(async () => {
    await _reset();
    authCobrador();
  });

  it("postea el batch y marca cada item sincronizado", async () => {
    await encolarVisita(visita());
    const res = await sincronizarRuta("ruta-1");
    expect(res.aplicadas + res.omitidas).toBeGreaterThanOrEqual(1);
    expect((await listarPendientes()).length).toBe(0);
  });

  it("es idempotente: un replay NO duplica ni deja pendientes", async () => {
    await encolarVisita(visita());
    // Servidor: primera vez aplica, replay -> omitida (idempotente por device id).
    let llamadas = 0;
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async ({ request }) => {
        llamadas += 1;
        const body = (await request.json()) as { paradas: { id: string }[] };
        const estado = llamadas === 1 ? "aplicada" : "omitida";
        const items = body.paradas.map((p) => ({ parada_id: p.id, estado, pago_id: null }));
        return HttpResponse.json({
          ruta_id: "ruta-1",
          items,
          aplicadas: estado === "aplicada" ? items.length : 0,
          omitidas: estado === "omitida" ? items.length : 0,
          rechazadas: 0,
        });
      }),
    );

    await sincronizarRuta("ruta-1");
    // Re-encolar el mismo device id es no-op; forzamos un segundo envío manual
    // re-insertando como pendiente para simular un replay del worker.
    const db = await getDB();
    const row = await db.get("visitas", "uuidv7-1");
    await db.put("visitas", { ...row!, estado: "pendiente" });

    const res2 = await sincronizarRuta("ruta-1");
    expect(res2.omitidas).toBe(1); // servidor lo omitió, no duplicó
    expect((await listarPendientes()).length).toBe(0);
  });

  it("un item rechazado queda en la cola con estado error", async () => {
    await encolarVisita(visita());
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async ({ request }) => {
        const body = (await request.json()) as { paradas: { id: string }[] };
        const items = body.paradas.map((p) => ({ parada_id: p.id, estado: "rechazada", pago_id: null }));
        return HttpResponse.json({ ruta_id: "ruta-1", items, aplicadas: 0, omitidas: 0, rechazadas: 1 });
      }),
    );
    const res = await sincronizarRuta("ruta-1");
    expect(res.rechazadas).toBe(1);
    const db = await getDB();
    const row = await db.get("visitas", "uuidv7-1");
    expect(row?.estado).toBe("error");
    // no quedó como 'pendiente' silenciosamente
    expect((await listarPendientes()).length).toBe(0);
  });

  it("no postea cuando no hay pendientes para la ruta", async () => {
    const res = await sincronizarRuta("ruta-1");
    expect(res.aplicadas).toBe(0);
    expect(res.omitidas).toBe(0);
    expect(res.enviado).toBe(false);
  });
});
