import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fx from "./fixtures";

/**
 * Contract test: valida que los fixtures MSW cumplan los campos REQUERIDOS de
 * su schema en el OpenAPI commiteado. Si el backend agrega/cambia un campo
 * requerido y los fixtures no se actualizan, este test falla en CI — corta la
 * clase de drift que ya causó bugs de runtime (login 401).
 */

interface OpenApiSchema {
  required?: string[];
  properties?: Record<string, unknown>;
}

const spec = JSON.parse(
  readFileSync(resolve(__dirname, "../../openapi.json"), "utf-8"),
) as { components: { schemas: Record<string, OpenApiSchema> } };

function requiredFields(schemaName: string): string[] {
  const s = spec.components.schemas[schemaName];
  if (!s) throw new Error(`Schema ${schemaName} no existe en openapi.json`);
  return s.required ?? [];
}

function assertCumpleContrato(obj: Record<string, unknown>, schemaName: string) {
  const faltantes = requiredFields(schemaName).filter((f) => !(f in obj));
  expect(faltantes, `${schemaName}: faltan campos requeridos`).toEqual([]);
}

describe("Contract — fixtures MSW vs OpenAPI", () => {
  it("Persona (PersonaOut) cumple el contrato", () => {
    fx.personas.forEach((p) => assertCumpleContrato(p as never, "PersonaOut"));
  });

  it("Referencia (ReferenciaOut) cumple el contrato", () => {
    fx.personas
      .flatMap((p) => (p as { referencias?: unknown[] }).referencias ?? [])
      .forEach((r) => assertCumpleContrato(r as never, "ReferenciaOut"));
  });

  it("Producto (ProductoOut) cumple el contrato", () => {
    fx.productos.forEach((p) => assertCumpleContrato(p as never, "ProductoOut"));
  });

  it("Solicitud (SolicitudOut) cumple el contrato", () => {
    fx.solicitudes.forEach((s) => assertCumpleContrato(s as never, "SolicitudOut"));
  });

  it("Prestamo (PrestamoOut) cumple el contrato", () => {
    fx.prestamos.forEach((p) => assertCumpleContrato(p as never, "PrestamoOut"));
  });

  it("Pago (PagoDetalleOut) cumple el contrato", () => {
    fx.pagos.forEach((p) => assertCumpleContrato(p as never, "PagoDetalleOut"));
  });

  it("Caja (CajaOut) cumple el contrato", () => {
    fx.cajas.forEach((c) => assertCumpleContrato(c as never, "CajaOut"));
  });

  it("todos los schemas referenciados existen en el OpenAPI", () => {
    // Sanity: el spec tiene los componentes que los fixtures derivan.
    for (const name of [
      "PersonaOut",
      "ReferenciaOut",
      "ProductoOut",
      "SolicitudOut",
      "PrestamoOut",
      "PagoDetalleOut",
      "CajaOut",
    ]) {
      expect(spec.components.schemas[name], `${name} debe existir`).toBeTruthy();
    }
  });
});
