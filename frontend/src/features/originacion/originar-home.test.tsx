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
  // Token con `sub` real para que el home resuelva el vendedor_id y consulte metas.
  setToken({
    access_token: makeAccessToken("v@x", ["vendedor"]),
    refresh_token: "r",
    token_type: "bearer",
  });
  setSessionUser({ ...vendedor, roles: ["vendedor"] });
});

describe("OriginarHome — home del vendedor", () => {
  it("muestra el KPI de mi meta del mes con avance", async () => {
    renderWithProviders(<OriginarHome />, { ...vendedor, roles: ["vendedor"] });
    expect(await screen.findByText(/Mi meta del mes/i)).toBeInTheDocument();
    // monto colocado del fixture (puede repetirse en el pipeline)
    expect((await screen.findAllByText("$ 300.000,00")).length).toBeGreaterThanOrEqual(1);
    // porcentaje de avance (único en la vista)
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("muestra mi cartera de clientes derivada de mis solicitudes", async () => {
    renderWithProviders(<OriginarHome />, { ...vendedor, roles: ["vendedor"] });
    expect(await screen.findByText(/Mis clientes/i)).toBeInTheDocument();
    // las fixtures tienen solicitudes para persona-1 (Gómez) y persona-2 (Pérez)
    const fichas = await screen.findAllByRole("button", { name: /ver ficha/i });
    expect(fichas.length).toBeGreaterThanOrEqual(1);
  });

  it("conserva el pipeline y la acción de nueva solicitud", async () => {
    renderWithProviders(<OriginarHome />, { ...vendedor, roles: ["vendedor"] });
    expect(await screen.findByText(/Mi pipeline/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /nueva solicitud/i }),
    ).toBeInTheDocument();
  });
});
