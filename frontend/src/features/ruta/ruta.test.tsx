import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { RutaPage } from "./RutaPage";
import { _reset, listarPendientes } from "./queue";
import { setToken, setSessionUser } from "@/lib/auth";

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
