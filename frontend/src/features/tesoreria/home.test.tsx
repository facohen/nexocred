import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { TesoreriaHome } from "./TesoreriaHome";
import { setToken, setSessionUser } from "@/lib/auth";

const tes = { email: "t@x", nombre: "Tes", roles: ["administrativo"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...tes, roles: ["administrativo"] });
});

describe("TesoreriaHome — home del rol tesorería", () => {
  it("muestra el hero Tesorería y la posición de capital", async () => {
    renderWithProviders(<TesoreriaHome />, { ...tes, roles: ["administrativo"] });
    expect(await screen.findByRole("heading", { name: /Tesorería/i })).toBeInTheDocument();
  });

  it("tiene una bandeja de liquidaciones (a aprobar / a pagar)", async () => {
    renderWithProviders(<TesoreriaHome />, { ...tes, roles: ["administrativo"] });
    const secciones = await screen.findAllByText(/Liquidaciones a (aprobar|pagar)/i);
    expect(secciones.length).toBe(2);
  });
});
