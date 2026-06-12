import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { RutaPage } from "./RutaPage";
import { _reset, listarPendientes } from "./queue";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "http://localhost/api/v1";

function authCobrador() {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ email: "cobrador@nexocred.test", nombre: "Cobra", roles: ["cobrador"] });
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
      roles: ["cobrador"],
    });
    expect((await screen.findAllByText(/Préstamo/i)).length).toBeGreaterThan(0);
    // saldo exigible formateado es-AR (12500.00 -> 12.500,00)
    expect(await screen.findByText(/12\.500,00/)).toBeInTheDocument();
  });

  it("muestra el contador de pendientes en el badge de sync", async () => {
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["cobrador"],
    });
    expect(await screen.findByTestId("sync-status")).toHaveTextContent(/0 pendientes/i);
  });

  it("submit OFFLINE encola y NO postea, muestra pendiente", async () => {
    setOnline(false);
    const user = userEvent.setup();
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["cobrador"],
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
      roles: ["cobrador"],
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
      roles: ["cobrador"],
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
      roles: ["cobrador"],
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
        const items = body.paradas.map((p) => ({ parada_id: p.id, estado: "aplicada", pago_id: null }));
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
      roles: ["cobrador"],
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

  it("es usable en ancho de teléfono (layout responsive)", async () => {
    renderWithProviders(<RutaPage rutaId="ruta-1" />, {
      email: "cobrador@nexocred.test",
      nombre: "Cobra",
      roles: ["cobrador"],
    });
    const root = await screen.findByTestId("ruta-root");
    // contenedor de ancho acotado para móvil
    expect(root.className).toMatch(/max-w-/);
  });
});
