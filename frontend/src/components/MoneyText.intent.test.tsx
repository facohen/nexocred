import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneyText } from "./MoneyText";

describe("MoneyText — font-num + intent", () => {
  it("usa la clase font-num para alineación tabular", () => {
    render(<MoneyText value="1234.56" />);
    const el = screen.getByText("$ 1.234,56");
    expect(el.className).toContain("font-num");
  });

  it("colorea según intent (ingreso=pos, egreso=neg)", () => {
    const { rerender } = render(<MoneyText value="100.00" intent="income" />);
    expect(screen.getByText("$ 100,00").className).toContain("text-pos");
    rerender(<MoneyText value="100.00" intent="expense" />);
    expect(screen.getByText("$ 100,00").className).toContain("text-neg");
  });

  it("muestra — para valor nulo", () => {
    render(<MoneyText value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("alinea a la derecha cuando align=right", () => {
    render(<MoneyText value="50.00" align="right" />);
    expect(screen.getByText("$ 50,00").className).toContain("text-right");
  });
});
