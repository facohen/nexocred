import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { TorreDashboard } from "./TorreDashboard";
import * as fx from "@/mocks/fixtures";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "http://localhost/api/v1";
const admin = { email: "admin@nexocred.test", nombre: "Admin", roles: ["admin"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...admin, roles: ["admin"] });
});

describe("TorreDashboard", () => {
  it("renderiza resumen (Índice Nexo) y pulso (5 cards) DESDE el mock", async () => {
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["admin"] });
    // Índice Nexo viene del mock (78.50), no hardcodeado
    expect(await screen.findByTestId("indice-nexo")).toHaveTextContent(/78,50/);
    const cards = await screen.findAllByTestId("pulso-card");
    expect(cards.length).toBe(fx.torrePulso.tarjetas.length);
    // un valor de tarjeta proviene del mock (cobranza hoy 20800.50)
    expect(screen.getAllByText(/20\.800,50/).length).toBeGreaterThan(0);
  });

  it("alertas-live con deep-link al préstamo", async () => {
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["admin"] });
    const link = await screen.findByRole("link", { name: /mora_temprana/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("prestamo-1"));
  });

  it("estado VACÍO cuando no hay snapshot (endpoints en cero)", async () => {
    server.use(
      http.get(`${BASE}/torre/resumen`, () => HttpResponse.json(fx.torreResumenVacio)),
      http.get(`${BASE}/torre/pulso`, () => HttpResponse.json(fx.torrePulsoVacio)),
    );
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["admin"] });
    expect(await screen.findByText(/Aún no hay snapshot/i)).toBeInTheDocument();
  });

  it("estado VACÍO cuando UNA sección reporta tiene_snapshot=false (OR)", async () => {
    // pulso sin snapshot mientras resumen sí: snapshot parcial/inconsistente
    // debe mostrar igualmente el estado vacío unificado.
    server.use(
      http.get(`${BASE}/torre/pulso`, () => HttpResponse.json(fx.torrePulsoVacio)),
    );
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["admin"] });
    expect(await screen.findByText(/Aún no hay snapshot/i)).toBeInTheDocument();
  });

  it("estado de error", async () => {
    server.use(
      http.get(`${BASE}/torre/resumen`, () =>
        HttpResponse.json({ error: { code: "x", message: "falló" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["admin"] });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
