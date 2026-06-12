import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { CajaPage } from "./CajaPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

describe("Caja", () => {
  it("muestra la posicion consolidada y el ledger append-only", async () => {
    renderWithProviders(<CajaPage />);
    // posicion consolidada total
    expect(await screen.findByText("$ 1.570.000,00")).toHaveClass("tabular-nums");
    // ledger de la caja seleccionada (movimiento de cobranza)
    expect(await screen.findByText(/Cobranza préstamo-1/)).toBeInTheDocument();
    expect(screen.getAllByText("$ 54.166,67")[0]).toHaveClass("tabular-nums");
  });
});
