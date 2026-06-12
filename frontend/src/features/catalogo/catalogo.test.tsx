import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { ProductosPage } from "./ProductosPage";
import { MatricesPage } from "./MatricesPage";
import { SimuladorPage } from "./SimuladorPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

describe("Productos", () => {
  it("lista productos con plazos y muestra gastos como strings", async () => {
    renderWithProviders(<ProductosPage />);
    expect((await screen.findAllByText("Préstamo Personal")).length).toBeGreaterThan(0);
    expect(screen.getByText("Crédito Prendario")).toBeInTheDocument();
    // gastos shown as strings (percent), money via tabular-nums
    expect(screen.getByText("2.50%")).toBeInTheDocument();
  });
});

describe("Matrices", () => {
  it("renderiza la grilla producto×perfil×plazo con tasas como strings", async () => {
    renderWithProviders(<MatricesPage />);
    // tasa rendered verbatim as string
    expect(await screen.findByText("30.00")).toBeInTheDocument();
    expect(screen.getByText("42.00")).toBeInTheDocument();
  });
});

describe("Simulador", () => {
  it("postea capital/tasa/plazo y renderiza la cronograma con money tabular-nums", async () => {
    renderWithProviders(<SimuladorPage />);
    await userEvent.clear(screen.getByLabelText(/capital/i));
    await userEvent.type(screen.getByLabelText(/capital/i), "100000");
    await userEvent.click(screen.getByRole("button", { name: /simular/i }));

    // total a pagar y una cuota de la cronograma
    const total = await screen.findByText("$ 130.000,00");
    expect(total).toHaveClass("tabular-nums");
    expect(screen.getAllByText("$ 10.833,33")[0]).toHaveClass("tabular-nums");
  });
});
