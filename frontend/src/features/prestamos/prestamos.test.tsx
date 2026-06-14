import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { PrestamoDetailPage } from "./PrestamoDetailPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ prestamoId: "prestamo-1" }),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "/api/v1";

describe("PrestamoDetail", () => {
  it("renderiza snapshot, cuotas, pagos y payoff con money como strings", async () => {
    renderWithProviders(<PrestamoDetailPage />);
    // capital del snapshot
    expect(await screen.findByText("$ 500.000,00")).toHaveClass("tabular-nums");
    // cuota del cronograma
    expect(screen.getAllByText("$ 54.166,67")[0]).toHaveClass("tabular-nums");
    // payoff total
    const payoff = await screen.findByLabelText(/payoff/i);
    expect(payoff).toBeInTheDocument();
    expect(screen.getByText("$ 429.166,66")).toHaveClass("tabular-nums");
  });

  it("lista las cuotas del array PELADO del backend (sin wrapper {data})", async () => {
    // El backend devuelve un array pelado; useCuotas ya no espera {data}. Si el
    // unwrap fuera el viejo, el cronograma quedaría vacío.
    renderWithProviders(<PrestamoDetailPage />);
    await screen.findByText("$ 500.000,00");
    // 12 cuotas en el fixture: cada una con su número de fila.
    const cuotaCells = await screen.findAllByText("$ 54.166,67");
    expect(cuotaCells.length).toBeGreaterThanOrEqual(12);
    // La columna "Saldo" fue removida (el backend no la provee).
    expect(screen.queryByRole("columnheader", { name: /saldo/i })).not.toBeInTheDocument();
  });

  it("payoff envía ?fecha_negocio (sin él el backend da 422)", async () => {
    let seenFecha: string | null = "MISSING";
    server.use(
      http.get(`${BASE}/prestamos/:id/payoff`, ({ request }) => {
        const url = new URL(request.url);
        seenFecha = url.searchParams.get("fecha_negocio");
        if (!seenFecha) {
          return HttpResponse.json(
            { error: { code: "unprocessable", message: "fecha_negocio requerido" } },
            { status: 422 },
          );
        }
        return HttpResponse.json({
          fecha_negocio: seenFecha,
          capital: "100.00",
          interes: "0.00",
          punitorio: "0.00",
          total: "100.00",
        });
      }),
    );
    renderWithProviders(<PrestamoDetailPage />);
    await screen.findByLabelText(/payoff/i);
    await waitFor(() => expect(seenFecha).not.toBe("MISSING"));
    // Debe ser una fecha YYYY-MM-DD, no null/vacío.
    expect(seenFecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
