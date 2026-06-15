import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { setToken, setSessionUser } from "@/lib/auth";

// El wizard usa useNavigate solo en callbacks (paso "listo"); sin router montado
// lo mockeamos como los demás tests de feature.
const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

import { OriginarWizard } from "./OriginarWizard";

const vendedor = { email: "v@x", nombre: "Vendedor", roles: ["vendedor"] as const };

beforeEach(() => {
  navigateMock.mockReset();
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...vendedor, roles: ["vendedor"] });
});

describe("OriginarWizard — asistente de originación", () => {
  it("arranca en el paso Cliente con la búsqueda", async () => {
    renderWithProviders(<OriginarWizard />, { ...vendedor, roles: ["vendedor"] });
    expect(await screen.findByRole("heading", { name: /Originar préstamo/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Buscar cliente/i)).toBeInTheDocument();
  });

  it("origina de punta a punta: cliente existente → préstamo → crear solicitud", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OriginarWizard />, { ...vendedor, roles: ["vendedor"] });

    // Paso 1: elegir un cliente existente de la lista
    const elegir = await screen.findAllByRole("button", { name: /Elegir/i });
    await user.click(elegir[0]);

    // Paso 2: condiciones del préstamo
    expect(
      await screen.findByRole("heading", { name: /Condiciones del préstamo/i }),
    ).toBeInTheDocument();
    // producto, monto y cuotas
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "producto-1");
    await user.type(screen.getByPlaceholderText("100000.00"), "100000.00");
    // el plazo aparece como select cuando el producto tiene plazos_permitidos
    const plazoSelect = screen.getAllByRole("combobox")[1];
    await user.selectOptions(plazoSelect, "6");
    await user.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 3: confirmar y crear
    expect(await screen.findByRole("heading", { name: /Revisá y confirmá/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Crear solicitud/i }));

    // Resultado: solicitud creada
    expect(await screen.findByRole("heading", { name: /Solicitud creada/i })).toBeInTheDocument();

    // El CTA navega a la solicitud creada
    await user.click(screen.getByRole("button", { name: /Ver la solicitud/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({ to: "/solicitudes/sol-nueva" }),
    );
  });

  it("permite volver del paso préstamo al paso cliente", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OriginarWizard />, { ...vendedor, roles: ["vendedor"] });
    const opciones = await screen.findAllByRole("button", { name: /Elegir/i });
    await user.click(opciones[0]);
    await screen.findByRole("heading", { name: /Condiciones del préstamo/i });
    await user.click(screen.getByRole("button", { name: /Volver/i }));
    expect(
      await screen.findByRole("heading", { name: /¿Para quién es el préstamo\?/i }),
    ).toBeInTheDocument();
  });
});
