import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { NovacionesPage } from "./NovacionesPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "/api/v1";

describe("Novaciones", () => {
  it("permite elegir el tipo y ejecutar la novacion mostrando la cadena", async () => {
    renderWithProviders(<NovacionesPage />);
    // cuatro tipos disponibles
    expect(screen.getByRole("button", { name: /refinanciar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /consolidar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /transferir/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /repactar/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /ejecutar/i }));
    // cadena de novación: nuevo préstamo resultante
    expect(await screen.findByText(/prestamo-2/)).toBeInTheDocument();
  });

  it("surfacea el error del backend como alerta en español", async () => {
    server.use(
      http.post(`${BASE}/novaciones/refinanciar`, () =>
        HttpResponse.json(
          { error: { code: "prestamo_no_vigente", message: "El préstamo origen no está vigente" } },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<NovacionesPage />);
    await userEvent.click(screen.getByRole("button", { name: /ejecutar/i }));
    expect(
      await screen.findByText(/El préstamo origen no está vigente/i),
    ).toBeInTheDocument();
  });
});
