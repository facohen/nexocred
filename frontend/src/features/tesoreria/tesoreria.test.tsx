import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { TesoreriaDashboard } from "./TesoreriaDashboard";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";
const tesoreria = { email: "tesoreria@nexocred.test", nombre: "Tes", roles: ["administrativo"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...tesoreria, roles: ["administrativo"] });
});

describe("TesoreriaDashboard", () => {
  it("renderiza posición (semáforo), cashflow, dcf y rotación con money strings", async () => {
    renderWithProviders(<TesoreriaDashboard />, { ...tesoreria, roles: ["administrativo"] });
    expect(await screen.findByText(/3\.500\.000,00/)).toBeInTheDocument(); // capital disponible
    expect(await screen.findByTestId("semaforo")).toHaveTextContent(/verde/i);
    expect(await screen.findByText(/1\.180\.000,00/)).toBeInTheDocument(); // DCF base
  });

  it("estado de error", async () => {
    server.use(
      http.get(`${BASE}/tesoreria/posicion`, () =>
        HttpResponse.json({ error: { code: "x", message: "falló" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<TesoreriaDashboard />, { ...tesoreria, roles: ["administrativo"] });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("estado de carga", async () => {
    renderWithProviders(<TesoreriaDashboard />, { ...tesoreria, roles: ["administrativo"] });
    expect(screen.getByTestId("tesoreria-loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("tesoreria-loading")).not.toBeInTheDocument());
  });
});
