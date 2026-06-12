import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { CajaPage } from "./CajaPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "http://localhost/api/v1";

describe("Caja", () => {
  it("muestra la posicion consolidada y el ledger append-only", async () => {
    renderWithProviders(<CajaPage />);
    // posicion consolidada total
    expect(await screen.findByText("$ 1.570.000,00")).toHaveClass("tabular-nums");
    // ledger de la caja seleccionada (movimiento de cobranza)
    expect(await screen.findByText(/Cobranza préstamo-1/)).toBeInTheDocument();
    expect(screen.getAllByText("$ 54.166,67")[0]).toHaveClass("tabular-nums");
  });

  it("muestra skeletons de carga mientras llega la posición", async () => {
    server.use(
      http.get(`${BASE}/cajas/posicion-consolidada`, async () => {
        await delay(200);
        return HttpResponse.json({ total: "0.00", cajas: [] });
      }),
    );
    renderWithProviders(<CajaPage />);
    expect(await screen.findByTestId("posicion-loading")).toBeInTheDocument();
  });

  it("muestra una alerta de error cuando la posición falla (500)", async () => {
    server.use(
      http.get(`${BASE}/cajas/posicion-consolidada`, () =>
        HttpResponse.json({ error: { code: "error_interno", message: "Error interno" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<CajaPage />);
    expect(await screen.findByText(/no se pudo cargar la posición/i)).toBeInTheDocument();
  });
});
