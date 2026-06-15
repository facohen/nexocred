import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { TorreDashboard } from "./TorreDashboard";
import * as fx from "@/mocks/fixtures";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";
const admin = { email: "admin@nexocred.test", nombre: "Admin", roles: ["ceo"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...admin, roles: ["ceo"] });
});

describe("TorreDashboard", () => {
  it("renderiza resumen (Índice Nexo) y pulso (5 cards) DESDE el mock", async () => {
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    // Índice Nexo viene del mock (78.50), no hardcodeado
    expect(await screen.findByTestId("indice-nexo")).toHaveTextContent(/78,50/);
    const cards = await screen.findAllByTestId("pulso-card");
    expect(cards.length).toBe(fx.torrePulso.tarjetas.length);
    // un valor de tarjeta proviene del mock (cobranza hoy 20800.50)
    expect(screen.getAllByText(/20\.800,50/).length).toBeGreaterThan(0);
  });

  it("alertas-live con deep-link al préstamo", async () => {
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    const link = await screen.findByRole("link", { name: /mora_temprana/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("prestamo-1"));
  });

  it("estado VACÍO cuando no hay snapshot (endpoints en cero)", async () => {
    server.use(
      http.get(`${BASE}/torre/resumen`, () => HttpResponse.json(fx.torreResumenVacio)),
      http.get(`${BASE}/torre/pulso`, () => HttpResponse.json(fx.torrePulsoVacio)),
    );
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    expect(await screen.findByText(/Aún no hay snapshot/i)).toBeInTheDocument();
  });

  it("estado VACÍO cuando UNA sección reporta tiene_snapshot=false (OR)", async () => {
    // pulso sin snapshot mientras resumen sí: snapshot parcial/inconsistente
    // debe mostrar igualmente el estado vacío unificado.
    server.use(
      http.get(`${BASE}/torre/pulso`, () => HttpResponse.json(fx.torrePulsoVacio)),
    );
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    expect(await screen.findByText(/Aún no hay snapshot/i)).toBeInTheDocument();
  });

  it("estado de error", async () => {
    server.use(
      http.get(`${BASE}/torre/resumen`, () =>
        HttpResponse.json({ error: { code: "x", message: "falló" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("muestra aging de cartera con la escala de mora (Al día / PAR30 / Castigo)", async () => {
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    expect(await screen.findByText(/Salud de cartera/i)).toBeInTheDocument();
    // Los tramos de la escala ordinal de mora en la sección de aging.
    expect(screen.getByText("Al día")).toBeInTheDocument();
    expect(screen.getByText("PAR60")).toBeInTheDocument();
    expect(screen.getByText("Castigo")).toBeInTheDocument();
  });

  it("el aging muestra los MONTOS reales (keys al_dia/1_30/... ), no $0", async () => {
    // Regresión A4: con las keys viejas ("0","1-30",...) el lookup fallaba y
    // todos los tramos mostraban $0,00. Con las keys reales deben verse los montos.
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    await screen.findByText(/Salud de cartera/i);
    // al_dia=1.000.000, 1_30=120.000, 31_60=60.000, 61_90=30.000, 90_mas=15.000
    expect(screen.getByText("$ 1.000.000,00")).toBeInTheDocument();
    expect(screen.getByText("$ 120.000,00")).toBeInTheDocument();
    expect(screen.getByText("$ 15.000,00")).toBeInTheDocument();
    // Ningún tramo debe quedar en $0,00 (lo que delataría el lookup roto).
    expect(screen.queryByText("$ 0,00")).not.toBeInTheDocument();
  });

  it("usa el nombre renombrado 'Alertas Activas' (no 'Alertas en vivo')", async () => {
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    expect(await screen.findByText("Alertas Activas")).toBeInTheDocument();
    expect(screen.queryByText(/Alertas en vivo/i)).not.toBeInTheDocument();
  });

  it("los KPIs de pulso son deep-links (drill-down accionable)", async () => {
    renderWithProviders(<TorreDashboard />, { ...admin, roles: ["ceo"] });
    const cards = await screen.findAllByTestId("pulso-card");
    // cada card está envuelta en un <a href> a su cola correspondiente
    cards.forEach((card) => {
      const link = card.closest("a");
      expect(link).toHaveAttribute("href");
    });
  });
});
