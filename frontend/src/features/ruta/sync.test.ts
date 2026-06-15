import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { encolarVisita, listarPendientes, _reset, type VisitaEncolada } from "./queue";
import { getDB } from "./db";
import { sincronizarRuta } from "./sync";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";

function authCobrador() {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ email: "cobrador@nexocred.test", nombre: "Cobra", roles: ["administrativo"] });
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
    const res = await sincronizarRuta("ruta-1", "caja-1");
    expect(res.aplicadas + res.omitidas).toBeGreaterThanOrEqual(1);
    expect((await listarPendientes()).length).toBe(0);
  });

  // BLOCKER — el sync de una visita de pago debe incluir caja_id en el body.
  it("incluye caja_id en el body del POST cuando hay visitas de pago", async () => {
    await encolarVisita(visita());
    let bodyCajaId: unknown = "AUSENTE";
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async ({ request }) => {
        const body = (await request.json()) as { paradas: { id: string }[]; caja_id?: string };
        bodyCajaId = body.caja_id;
        const items = body.paradas.map((p) => ({ parada_id: p.id, estado: "aplicada", pago_id: null }));
        return HttpResponse.json({ ruta_id: "ruta-1", items, aplicadas: 1, omitidas: 0, rechazadas: 0 });
      }),
    );
    await sincronizarRuta("ruta-1", "caja-1");
    expect(bodyCajaId).toBe("caja-1");
  });

  // BLOCKER — sincronizar visitas de pago SIN caja seleccionada se previene con
  // un error claro (no un 422 silencioso del backend).
  it("rechaza con mensaje claro si hay visitas de pago y no se seleccionó caja", async () => {
    await encolarVisita(visita()); // resultado 'pago' con montoCobrado
    let llamado = false;
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, () => {
        llamado = true;
        return HttpResponse.json({ ruta_id: "ruta-1", items: [], aplicadas: 0, omitidas: 0, rechazadas: 0 });
      }),
    );
    await expect(sincronizarRuta("ruta-1", undefined)).rejects.toThrow(/[Ss]eleccioná una caja/);
    expect(llamado).toBe(false); // no se postea: se previene antes del 422
    expect((await listarPendientes()).length).toBe(1); // nada se pierde
  });

  // Visitas SIN cobro (p.ej. ausente) pueden sincronizar sin caja.
  it("permite sincronizar visitas sin cobro aunque no haya caja", async () => {
    await encolarVisita(visita({ resultado: "ausente", montoCobrado: null, pagoId: null }));
    const res = await sincronizarRuta("ruta-1", undefined);
    expect(res.enviado).toBe(true);
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

    await sincronizarRuta("ruta-1", "caja-1");
    // Re-encolar el mismo device id es no-op; forzamos un segundo envío manual
    // re-insertando como pendiente para simular un replay del worker.
    const db = await getDB();
    const row = await db.get("visitas", "uuidv7-1");
    await db.put("visitas", { ...row!, estado: "pendiente" });

    const res2 = await sincronizarRuta("ruta-1", "caja-1");
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
    const res = await sincronizarRuta("ruta-1", "caja-1");
    expect(res.rechazadas).toBe(1);
    const db = await getDB();
    const row = await db.get("visitas", "uuidv7-1");
    expect(row?.estado).toBe("error");
    // no quedó como 'pendiente' silenciosamente
    expect((await listarPendientes()).length).toBe(0);
  });

  it("no postea cuando no hay pendientes para la ruta", async () => {
    const res = await sincronizarRuta("ruta-1", "caja-1");
    expect(res.aplicadas).toBe(0);
    expect(res.omitidas).toBe(0);
    expect(res.enviado).toBe(false);
  });

  // MAJOR 1 — fallo atómico de batch (409/422) no debe descartar ni marcar nada.
  it("un error de batch 409 deja los items pendientes y surfacea el mensaje del backend", async () => {
    await encolarVisita(visita());
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, () =>
        HttpResponse.json(
          { error: { code: "pago_inmutable", message: "el pago ya fue corregido" } },
          { status: 409 },
        ),
      ),
    );
    await expect(sincronizarRuta("ruta-1", "caja-1")).rejects.toMatchObject({
      code: "pago_inmutable",
      message: "el pago ya fue corregido",
    });
    // nada marcado sincronizado: el item sigue pendiente para reintento
    expect((await listarPendientes()).length).toBe(1);
    const db = await getDB();
    const row = await db.get("visitas", "uuidv7-1");
    expect(row?.estado).toBe("pendiente");
  });

  // MAJOR 1 — si el error identifica un pago_id ofensor, ese item se marca error
  // y el resto queda pendiente.
  it("un 409 pago_inmutable con pago_id ofensor marca SOLO ese item error y deja el resto pendiente", async () => {
    await encolarVisita(visita({ id: "uuidv7-1", pagoId: "pago-malo" }));
    await encolarVisita(visita({ id: "uuidv7-2", paradaId: "p2", pagoId: "pago-ok" }));
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, () =>
        HttpResponse.json(
          {
            error: {
              code: "pago_inmutable",
              message: "el pago ya fue corregido",
              details: { pago_id: "pago-malo" },
            },
          },
          { status: 409 },
        ),
      ),
    );
    await expect(sincronizarRuta("ruta-1", "caja-1")).rejects.toMatchObject({ code: "pago_inmutable" });
    const db = await getDB();
    expect((await db.get("visitas", "uuidv7-1"))?.estado).toBe("error");
    expect((await db.get("visitas", "uuidv7-2"))?.estado).toBe("pendiente");
  });

  // MAJOR 2 — estado desconocido NO debe marcarse sincronizado (no se descarta la fila).
  it("un item con estado desconocido queda pendiente (no se marca sincronizado)", async () => {
    await encolarVisita(visita());
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async ({ request }) => {
        const body = (await request.json()) as { paradas: { id: string }[] };
        const items = body.paradas.map((p) => ({ parada_id: p.id, estado: "marciana", pago_id: null }));
        return HttpResponse.json({ ruta_id: "ruta-1", items, aplicadas: 0, omitidas: 0, rechazadas: 0 });
      }),
    );
    const res = await sincronizarRuta("ruta-1", "caja-1");
    expect((await listarPendientes()).length).toBe(1);
    const db = await getDB();
    expect((await db.get("visitas", "uuidv7-1"))?.estado).toBe("pendiente");
    expect(res.noReconciliadas).toBeGreaterThanOrEqual(1);
  });

  // MAJOR 2 — 'omitida' SÍ converge a sincronizado.
  it("estado omitida converge a sincronizado", async () => {
    await encolarVisita(visita());
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async ({ request }) => {
        const body = (await request.json()) as { paradas: { id: string }[] };
        const items = body.paradas.map((p) => ({ parada_id: p.id, estado: "omitida", pago_id: null }));
        return HttpResponse.json({ ruta_id: "ruta-1", items, aplicadas: 0, omitidas: 1, rechazadas: 0 });
      }),
    );
    await sincronizarRuta("ruta-1", "caja-1");
    expect((await listarPendientes()).length).toBe(0);
  });

  // MAJOR 3 — una parada posteada ausente de items[] queda pendiente y se flaggea.
  it("una parada posteada ausente en items[] queda pendiente y marca el desajuste", async () => {
    await encolarVisita(visita({ id: "uuidv7-1" }));
    await encolarVisita(visita({ id: "uuidv7-2", paradaId: "p2", pagoId: "pago-2" }));
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async ({ request }) => {
        const body = (await request.json()) as { paradas: { id: string }[] };
        // El servidor "olvida" devolver la segunda parada en items[].
        const first = body.paradas[0];
        return HttpResponse.json({
          ruta_id: "ruta-1",
          items: [{ parada_id: first.id, estado: "aplicada", pago_id: null }],
          aplicadas: 2, // counters mienten: dicen 2 pero items solo tiene 1
          omitidas: 0,
          rechazadas: 0,
        });
      }),
    );
    const res = await sincronizarRuta("ruta-1", "caja-1");
    const db = await getDB();
    expect((await db.get("visitas", "uuidv7-1"))?.estado).toBe("sincronizado");
    // la no-acusada sigue pendiente, no confiamos en los counters agregados
    expect((await db.get("visitas", "uuidv7-2"))?.estado).toBe("pendiente");
    expect(res.noReconciliadas).toBe(1);
  });
});
