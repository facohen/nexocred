import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MoneyText } from "./MoneyText";

describe("MoneyText", () => {
  it("renderiza es-AR con tabular-nums", () => {
    render(<MoneyText value="14500.00" />);
    const el = screen.getByText("$ 14.500,00");
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass("tabular-nums");
  });

  it("sin prefijo cuando withSymbol=false", () => {
    render(<MoneyText value="1000000.50" withSymbol={false} />);
    expect(screen.getByText("1.000.000,50")).toBeInTheDocument();
  });

  it("cae a '—' (sin '$') ante un string NO canónico en vez de crashear", () => {
    // formatMoney() tira Error('Monto invalido') ante un string con coma decimal
    // o letras; MoneyText debe atraparlo (no hay ErrorBoundary que lo cubra
    // inline) y mostrar '—', no propagar y dejar la pantalla en blanco.
    for (const malo of ["12,50", "1234,56", "abc", "$100"]) {
      const { unmount } = render(<MoneyText value={malo} />);
      expect(screen.getByText("—")).toBeInTheDocument();
      // El fallback NO debe llevar el prefijo "$".
      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
      unmount();
    }
  });
});
