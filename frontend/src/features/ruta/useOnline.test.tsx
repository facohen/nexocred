import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { useRutaSync } from "./useOnline";
import { encolarVisita, _reset, type VisitaEncolada } from "./queue";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";

function authCobrador() {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ email: "cobrador@nexocred.test", nombre: "Cobra", roles: ["administrativo"] });
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

const visita = (over: Partial<VisitaEncolada> = {}): VisitaEncolada => ({
  id: "uuidv7-1",
  rutaId: "ruta-1",
  paradaId: "p1",
  prestamoId: "L1",
  orden: 1,
  resultado: "ausente",
  montoCobrado: null,
  pagoId: null,
  fotoUrl: null,
  lat: null,
  lng: null,
  notas: null,
  visitadaEn: "2026-06-12T10:00:00Z",
  ...over,
});

describe("useRutaSync — fallbacks de drenado de cola", () => {
  beforeEach(async () => {
    await _reset();
    authCobrador();
    setOnline(true);
    setVisibility("visible");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("volverse visible estando online con pendientes dispara un intento de sync", async () => {
    let posteado = false;
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async ({ request }) => {
        posteado = true;
        const body = (await request.json()) as { paradas: { id: string }[] };
        const items = body.paradas.map((p) => ({ parada_id: p.id, estado: "aplicada", pago_id: null }));
        return HttpResponse.json({ ruta_id: "ruta-1", items, aplicadas: 1, omitidas: 0, rechazadas: 0 });
      }),
    );
    await encolarVisita(visita());
    renderHook(() => useRutaSync("ruta-1", "caja-1"));

    // Simular que la pestaña pasa a visible (webview que no dispara 'online').
    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(posteado).toBe(true));
  });
});
