import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { RutaPage } from "./RutaPage";
import { _reset, listarPendientes } from "./queue";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";

function authCobrador() {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ email: "cobrador@nexocred.test", nombre: "Cobra", roles: ["administrativo"] });
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("RutaPage (La Ruta offline)", () => {
  beforeEach(async () => {
    await _reset();
    authCobrador();
    setOnline(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("carga la ruta asignada y lista paradas con saldo (MoneyText)", async () => {
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });
    expect((await screen.findAllByText(/Préstamo/i)).length).toBeGreaterThan(0);
    // saldo exigible formateado es-AR (12500.00 -> 12.500,00)
    expect(await screen.findByText(/12\.500,00/)).toBeInTheDocument();
  });

  it("muestra la cabecera-dashboard del día (cobrado, paradas hechas/total)", async () => {
    server.use(
      http.get(`${BASE}/rutas/:id/paradas`, () =>
        HttpResponse.json({
          data: [
            {
              id: "parada-1",
              ruta_id: "ruta-1",
              prestamo_id: "prestamo-1",
              orden: 1,
              resultado: "pago",
              monto_cobrado: "5000.00",
              foto_url: null,
              lat: null,
              lng: null,
              notas: null,
              visitada_en: "2026-06-14T09:00:00Z",
              saldo_exigible: "12500.00",
            },
            {
              id: "parada-2",
              ruta_id: "ruta-1",
              prestamo_id: "prestamo-2",
              orden: 2,
              resultado: null,
              monto_cobrado: null,
              foto_url: null,
              lat: null,
              lng: null,
              notas: null,
              visitada_en: null,
              saldo_exigible: "8300.50",
            },
          ],
          total: 2,
          page: 1,
          per_page: 50,
        }),
      ),
    );
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });
    const resumen = await screen.findByLabelText(/resumen del día/i);
    // cobrado del día = 5.000,00
    expect(within(resumen).getByText(/5\.000,00/)).toBeInTheDocument();
    // 1 de 2 paradas hechas
    expect(within(resumen).getByText("1/2")).toBeInTheDocument();
  });

  it("muestra el contador de pendientes en el badge de sync", async () => {
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });
    expect(await screen.findByTestId("sync-status")).toHaveTextContent(/0 pendientes/i);
  });

  it("submit OFFLINE encola y NO postea, muestra pendiente", async () => {
    setOnline(false);
    const user = userEvent.setup();
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });

    const registrar = await screen.findAllByRole("button", { name: /Registrar visita/i });
    await user.click(registrar[0]);
    // formulario de captura
    const monto = await screen.findByLabelText(/Monto cobrado/i);
    await user.clear(monto);
    await user.type(monto, "2200.00");
    await user.click(screen.getByRole("button", { name: /Guardar visita/i }));

    await waitFor(async () => {
      expect((await listarPendientes()).length).toBe(1);
    });
    expect(await screen.findByTestId("sync-status")).toHaveTextContent(/1 pendiente/i);
  });

  it("submit ONLINE encola y dispara sincronización (cola converge a 0)", async () => {
    setOnline(true);
    const user = userEvent.setup();
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });

    // Cobro requiere caja seleccionada para poder sincronizar.
    const selectorCaja = await screen.findByLabelText(/[Cc]aja/i);
    await screen.findByRole("option", { name: /Caja Central/i });
    await user.selectOptions(selectorCaja, "caja-1");

    const registrar = await screen.findAllByRole("button", { name: /Registrar visita/i });
    await user.click(registrar[0]);
    const monto = await screen.findByLabelText(/Monto cobrado/i);
    await user.clear(monto);
    await user.type(monto, "2200.00");
    await user.click(screen.getByRole("button", { name: /Guardar visita/i }));

    await waitFor(async () => {
      expect((await listarPendientes()).length).toBe(0);
    });
  });

  it("BLOCKER: muestra un selector de caja con las cajas de GET /cajas", async () => {
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });
    const selector = await screen.findByLabelText(/[Cc]aja/i);
    // opción del fixture de cajas (Caja Central)
    expect(await screen.findByRole("option", { name: /Caja Central/i })).toBeInTheDocument();
    expect(selector).toBeInTheDocument();
  });

  it("BLOCKER: sin caja seleccionada, una visita de pago no sincroniza y avisa 'Seleccioná una caja'", async () => {
    setOnline(true);
    const user = userEvent.setup();
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });

    const registrar = await screen.findAllByRole("button", { name: /Registrar visita/i });
    await user.click(registrar[0]);
    const monto = await screen.findByLabelText(/Monto cobrado/i);
    await user.clear(monto);
    await user.type(monto, "2200.00");
    await user.click(screen.getByRole("button", { name: /Guardar visita/i }));

    // Quedó encolada pero NO sincronizó (sin caja): aviso claro, item pendiente.
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/[Ss]eleccioná una caja/i);
    await waitFor(async () => {
      expect((await listarPendientes()).length).toBe(1);
    });
  });

  it("BLOCKER: con caja seleccionada, la visita de pago incluye caja_id y sincroniza (cola → 0)", async () => {
    setOnline(true);
    let bodyCajaId: unknown = "AUSENTE";
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async ({ request, params }) => {
        const body = (await request.json()) as { paradas: { id: string }[]; caja_id?: string };
        bodyCajaId = body.caja_id;
        const items = body.paradas.map((p) => ({
          parada_id: p.id,
          estado: "aplicada",
          pago_id: null,
        }));
        return HttpResponse.json({
          ruta_id: params.id,
          items,
          aplicadas: items.length,
          omitidas: 0,
          rechazadas: 0,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });

    // Seleccionar caja
    const selector = await screen.findByLabelText(/[Cc]aja/i);
    await screen.findByRole("option", { name: /Caja Central/i });
    await user.selectOptions(selector, "caja-1");

    const registrar = await screen.findAllByRole("button", { name: /Registrar visita/i });
    await user.click(registrar[0]);
    const monto = await screen.findByLabelText(/Monto cobrado/i);
    await user.clear(monto);
    await user.type(monto, "2200.00");
    await user.click(screen.getByRole("button", { name: /Guardar visita/i }));

    await waitFor(async () => {
      expect((await listarPendientes()).length).toBe(0);
    });
    expect(bodyCajaId).toBe("caja-1");
  });

  it("MINOR: una parada visitada se puede re-abrir y corregir con ids nuevos (no se descarta)", async () => {
    setOnline(false); // offline: la corrección solo encola, sin postear
    // parada-1 ya viene visitada desde el backend.
    server.use(
      http.get(`${BASE}/rutas/:id/paradas`, () =>
        HttpResponse.json({
          data: [
            {
              id: "parada-1",
              ruta_id: "ruta-1",
              prestamo_id: "prestamo-1",
              orden: 1,
              resultado: "pago",
              monto_cobrado: "2000.00",
              foto_url: null,
              lat: null,
              lng: null,
              notas: null,
              visitada_en: "2026-06-12T09:00:00Z",
              saldo_exigible: "12500.00",
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });

    // Estado visitado visible + acción para corregir.
    expect(await screen.findByText(/Visitada/i)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Corregir/i }));

    const monto = await screen.findByLabelText(/Monto cobrado/i);
    await user.clear(monto);
    await user.type(monto, "1800.00");
    await user.click(screen.getByRole("button", { name: /Guardar visita/i }));

    // Se encoló una NUEVA entrada de corrección con device id + pago_id frescos.
    await waitFor(async () => {
      expect((await listarPendientes()).length).toBe(1);
    });
    const pend = await listarPendientes();
    expect(pend[0].id).toMatch(/^[0-9a-f-]{36}$/i); // UUIDv7 fresco de dispositivo
    expect(pend[0].pagoId).toMatch(/^[0-9a-f-]{36}$/i); // pago_id fresco
    expect(pend[0].id).not.toBe(pend[0].pagoId);
    expect(pend[0].montoCobrado).toBe("1800.00");
  });

  it("es usable en ancho de teléfono (layout responsive)", async () => {
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["administrativo"],
    });
    const root = await screen.findByTestId("ruta-root");
    // contenedor de ancho acotado para móvil
    expect(root.className).toMatch(/max-w-/);
  });
});
