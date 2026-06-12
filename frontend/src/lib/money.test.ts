import { describe, it, expect } from "vitest";
import { formatMoney, parseMoney, addMoney, subMoney, compareMoney } from "./money";

describe("money", () => {
  it("formatea es-AR con separador de miles y coma decimal", () => {
    expect(formatMoney("14500.00")).toBe("14.500,00");
    expect(formatMoney("1000000.5")).toBe("1.000.000,50");
    expect(formatMoney("0")).toBe("0,00");
  });

  it("formatea negativos", () => {
    expect(formatMoney("-1234.5")).toBe("-1.234,50");
  });

  it("parseMoney normaliza a string con 2 decimales sin float", () => {
    expect(parseMoney("14500")).toBe("14500.00");
    expect(parseMoney("0.1")).toBe("0.10");
  });

  it("suma sin float (aritmetica de centavos)", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    expect(addMoney("14500.00", "0.99")).toBe("14500.99");
  });

  it("resta sin float", () => {
    expect(subMoney("0.30", "0.10")).toBe("0.20");
    expect(subMoney("100.00", "100.01")).toBe("-0.01");
  });

  it("compara montos como enteros de centavos", () => {
    expect(compareMoney("100.00", "100.01")).toBe(-1);
    expect(compareMoney("100.01", "100.00")).toBe(1);
    expect(compareMoney("100.00", "100.00")).toBe(0);
  });
});
