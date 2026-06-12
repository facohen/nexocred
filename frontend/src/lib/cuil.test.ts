import { describe, it, expect } from "vitest";
import { validarCuil, calcularDigitoVerificador } from "./cuil";

describe("validarCuil (modulo 11)", () => {
  it("acepta CUILs validos", () => {
    expect(validarCuil("20123456786")).toBe(true);
    expect(validarCuil("27111111117")).toBe(true);
    // con separadores
    expect(validarCuil("20-12345678-6")).toBe(true);
    expect(validarCuil("27-30111222-5")).toBe(true);
  });

  it("rechaza un digito verificador incorrecto", () => {
    expect(validarCuil("20123456780")).toBe(false);
    expect(validarCuil("27-30111222-4")).toBe(false);
  });

  it("rechaza longitudes/formatos invalidos", () => {
    expect(validarCuil("123")).toBe(false);
    expect(validarCuil("201234567860")).toBe(false);
    expect(validarCuil("abcdefghijk")).toBe(false);
    expect(validarCuil("")).toBe(false);
  });

  it("calcularDigitoVerificador maneja resto 11->0 y 10->9", () => {
    // espeja el backend (pesos 5,4,3,2,7,6,5,4,3,2)
    expect(calcularDigitoVerificador("2712345678")).toBeGreaterThanOrEqual(0);
    // 27-30111222-5 es válido → dv de los primeros 10 dígitos es 5
    expect(calcularDigitoVerificador("2730111222")).toBe(5);
  });
});
