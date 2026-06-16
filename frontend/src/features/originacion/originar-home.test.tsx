import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { setToken, setSessionUser } from "@/lib/auth";
import { makeAccessToken } from "@/mocks/fixtures";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import { OriginarHome } from "./OriginarHome";

const vendedor = { email: "v@x", nombre: "Vendedor", roles: ["vendedor"] as const };

beforeEach(() => {
  setToken({
    access_token: makeAccessToken("v@x", ["vendedor"]),
    refresh_token: "r",
    token_type: "bearer",
  });
  setSessionUser({ ...vendedor, roles: ["vendedor"] });
});

// OriginarHome quedó enfocada SOLO en el pipeline + alta de solicitud. Las metas,
// conversión y comisiones se movieron al Inicio del vendedor (VendedorHome).
describe("OriginarHome — pipeline del vendedor", () => {
  it("muestra el pipeline agrupado (sin botón de nueva solicitud)", async () => {
    renderWithProviders(<OriginarHome />, { ...vendedor, roles: ["vendedor"] });
    expect(await screen.findByRole("heading", { name: /Originar/i })).toBeInTheDocument();
    // Originar es solo el pipeline/carga: el alta NO vive acá.
    expect(screen.queryByRole("button", { name: /nueva solicitud/i })).not.toBeInTheDocument();
    // Secciones del inbox de pipeline.
    expect(await screen.findByText(/En curso/i)).toBeInTheDocument();
  });

  it("ya NO muestra las metas ni la cartera (movidas al Inicio del vendedor)", async () => {
    renderWithProviders(<OriginarHome />, { ...vendedor, roles: ["vendedor"] });
    await screen.findByRole("heading", { name: /Originar/i });
    expect(screen.queryByText(/Mi meta del mes/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
