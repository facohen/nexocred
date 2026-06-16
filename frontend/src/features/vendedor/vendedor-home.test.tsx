import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { setToken, setSessionUser } from "@/lib/auth";
import { makeAccessToken } from "@/mocks/fixtures";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import { VendedorHome } from "./VendedorHome";

const vendedor = { email: "v@x", nombre: "Vendedor Uno", roles: ["vendedor"] as const };

beforeEach(() => {
  // Token con `sub` real para que el home resuelva el vendedor_id y consulte metas.
  setToken({
    access_token: makeAccessToken("v@x", ["vendedor"]),
    refresh_token: "r",
    token_type: "bearer",
  });
  setSessionUser({ ...vendedor, roles: ["vendedor"] });
});

describe("VendedorHome — Inicio del vendedor (dashboard de performance)", () => {
  it("saluda al vendedor y muestra el KPI de meta del mes con avance", async () => {
    renderWithProviders(<VendedorHome />, { ...vendedor, roles: ["vendedor"] });
    expect(await screen.findByText(/Hola, Vendedor/i)).toBeInTheDocument();
    expect(await screen.findByText(/Mi meta del mes/i)).toBeInTheDocument();
    // porcentaje de avance del fixture de metas (único en la vista)
    expect(await screen.findByText("60%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("muestra los KPIs de pipeline, conversión y comisiones", async () => {
    renderWithProviders(<VendedorHome />, { ...vendedor, roles: ["vendedor"] });
    expect(await screen.findByText(/Mi pipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Conversión/i)).toBeInTheDocument();
    expect(screen.getByText(/Comisiones/i)).toBeInTheDocument();
  });

  it("ofrece accesos rápidos a las áreas del vendedor", async () => {
    renderWithProviders(<VendedorHome />, { ...vendedor, roles: ["vendedor"] });
    expect(await screen.findByText(/Mis créditos/i)).toBeInTheDocument();
    expect(screen.getByText(/Gestiones/i)).toBeInTheDocument();
  });
});
