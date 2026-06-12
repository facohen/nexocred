import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { PrestamoDetailPage } from "./PrestamoDetailPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ prestamoId: "prestamo-1" }),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

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
});
