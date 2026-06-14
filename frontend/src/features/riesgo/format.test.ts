import { describe, it, expect } from "vitest";
import { formatPercent, formatRatioPercent, severidadTone } from "./format";

describe("formatPercent (ya-porcentaje)", () => {
  it("intercambia el separador decimal y agrega %", () => {
    expect(formatPercent("8.50")).toBe("8,50 %");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatRatioPercent (ratio → porcentaje, sin float)", () => {
  it("escala el ratio del backend a porcentaje es-AR", () => {
    expect(formatRatioPercent("0.0250")).toBe("2,50 %");
    expect(formatRatioPercent("0.0300")).toBe("3,00 %");
    expect(formatRatioPercent("0.005")).toBe("0,50 %");
    expect(formatRatioPercent("0.10")).toBe("10,00 %");
    expect(formatRatioPercent("1")).toBe("100,00 %");
    expect(formatRatioPercent("0")).toBe("0,00 %");
    expect(formatRatioPercent("-0.0250")).toBe("-2,50 %");
  });

  it("devuelve '—' para nulo/vacío y el crudo para no-numérico", () => {
    expect(formatRatioPercent(null)).toBe("—");
    expect(formatRatioPercent("")).toBe("—");
    expect(formatRatioPercent("abc")).toBe("abc");
  });
});

describe("severidadTone", () => {
  it("critica y alta → danger", () => {
    expect(severidadTone("critica")).toBe("danger");
    expect(severidadTone("alta")).toBe("danger");
  });
  it("media → warning, baja/desconocida/null → default", () => {
    expect(severidadTone("media")).toBe("warning");
    expect(severidadTone("baja")).toBe("default");
    expect(severidadTone("rara")).toBe("default");
    expect(severidadTone(null)).toBe("default");
  });
});
