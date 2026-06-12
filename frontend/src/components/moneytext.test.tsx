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
});
