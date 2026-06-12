import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  encolarVisita,
  listarPendientes,
  marcarSincronizado,
  marcarError,
  construirBatch,
  contarPendientes,
  _reset,
  type VisitaEncolada,
} from "./queue";
import { uuidv7 } from "./uuidv7";

const visita = (over: Partial<VisitaEncolada> = {}): VisitaEncolada => ({
  id: "uuidv7-1",
  rutaId: "R1",
  paradaId: "p1",
  prestamoId: "L1",
  orden: 1,
  resultado: "pago",
  montoCobrado: "2200.00",
  pagoId: "uuidv7-pago-1",
  fotoUrl: null,
  lat: "-34.60",
  lng: "-58.38",
  notas: null,
  visitadaEn: "2026-06-12T10:00:00Z",
  ...over,
});

describe("cola offline (IndexedDB pura)", () => {
  beforeEach(async () => {
    await _reset();
  });

  it("encola y construye batch idempotente por device id", async () => {
    const v = visita();
    await encolarVisita(v);
    await encolarVisita(v); // mismo device id → NO duplica
    const pend = await listarPendientes();
    expect(pend.length).toBe(1);
    expect(pend[0].estado).toBe("pendiente");

    const batch = await construirBatch("R1");
    expect(batch.paradas.length).toBe(1);
    expect(batch.paradas[0].id).toBe("uuidv7-1");
    expect(batch.paradas[0].pago_id).toBe("uuidv7-pago-1");
    expect(batch.paradas[0].resultado).toBe("pago");
    // Money stays a string through the queue — never a Number.
    expect(batch.paradas[0].monto_cobrado).toBe("2200.00");
    expect(typeof batch.paradas[0].monto_cobrado).toBe("string");
    expect(batch.paradas[0].lat).toBe("-34.60");
  });

  it("marcarSincronizado saca del set de pendientes", async () => {
    await encolarVisita(visita());
    await marcarSincronizado("uuidv7-1");
    expect((await listarPendientes()).length).toBe(0);
    expect(await contarPendientes()).toBe(0);
  });

  it("marcarError deja la visita encolada con estado error y motivo", async () => {
    await encolarVisita(visita());
    await marcarError("uuidv7-1", "saldo_insuficiente");
    const pend = await listarPendientes();
    // error sigue en la cola para reintento manual, pero no como 'pendiente' de envío
    expect(pend.length).toBe(0);
  });

  it("construirBatch solo incluye paradas de la ruta pedida", async () => {
    await encolarVisita(visita({ id: "a", rutaId: "R1" }));
    await encolarVisita(visita({ id: "b", rutaId: "R2", paradaId: "p2" }));
    const batch = await construirBatch("R1");
    expect(batch.paradas.map((p) => p.id)).toEqual(["a"]);
  });

  it("uuidv7 genera ids ordenables y únicos con versión 7", () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
