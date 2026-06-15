import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// recharts mide el contenedor con ResizeObserver; en jsdom no existe.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

import { AnalisisCarteraPage } from "./AnalisisCarteraPage";

const BASE = "/api/v1";

describe("AnalisisCarteraPage", () => {
  it("muestra los KPIs de cartera (capital, margen, rentabilidad, PE)", async () => {
    renderWithProviders(<AnalisisCarteraPage />);
    expect(await screen.findByText(/capital colocado/i)).toBeInTheDocument();
    expect(await screen.findByText("$ 1.225.000,00")).toBeInTheDocument();
    // rentabilidad global ratio 0.1714 → 17,14 %
    expect(screen.getByText("17,14 %")).toBeInTheDocument();
  });

  it("lista la rentabilidad por línea con margen y resalta la que destruye valor", async () => {
    renderWithProviders(<AnalisisCarteraPage />);
    expect(await screen.findByText("Crédito Productivo")).toBeInTheDocument();
    expect(screen.getByText("Crédito Express")).toBeInTheDocument();
    // la línea que destruye valor muestra rentabilidad negativa (ratio -0.0743)
    expect(screen.getByText("-7,43 %")).toBeInTheDocument();
  });

  it("permite cambiar la dimensión de análisis", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnalisisCarteraPage />);
    await screen.findByText("Crédito Productivo");
    await user.click(screen.getByRole("button", { name: /segmento de cliente/i }));
    // sigue mostrando datos tras el toggle (el mock devuelve el set de producto)
    expect(await screen.findByText("Crédito Productivo")).toBeInTheDocument();
  });

  it("ofrece deep-link a préstamos por línea de crédito", async () => {
    renderWithProviders(<AnalisisCarteraPage />);
    const link = await screen.findByRole("link", { name: "Crédito Productivo" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/prestamos?producto_id="));
  });

  it("muestra un error si el resumen falla", async () => {
    server.use(
      http.get(`${BASE}/analytics/resumen`, () =>
        HttpResponse.json({ error: { code: "x", message: "boom" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<AnalisisCarteraPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cargar el resumen/i);
  });
});
