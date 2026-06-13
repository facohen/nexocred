import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { PersonasListPage } from "./PersonasListPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "/api/v1";

describe("PersonasListPage estados", () => {
  it("muestra un skeleton de carga", () => {
    server.use(
      http.get(`${BASE}/personas`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ data: [], total: 0, page: 1, per_page: 50 });
      }),
    );
    renderWithProviders(<PersonasListPage />);
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it("muestra el estado de error cuando el backend responde 500", async () => {
    server.use(
      http.get(`${BASE}/personas`, () =>
        HttpResponse.json({ error: { code: "interno", message: "boom" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<PersonasListPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);
  });

  it("muestra el estado vacío cuando no hay resultados", async () => {
    server.use(
      http.get(`${BASE}/personas`, () =>
        HttpResponse.json({ data: [], total: 0, page: 1, per_page: 50 }),
      ),
    );
    renderWithProviders(<PersonasListPage />);
    await waitFor(() =>
      expect(screen.getByText(/no hay personas que coincidan/i)).toBeInTheDocument(),
    );
  });
});
