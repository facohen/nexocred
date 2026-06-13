import { describe, it, expect } from "vitest";
import { areasVisibles, areasPorSeccion, destinosNavegables, WORK_AREAS } from "./nav";

describe("nav — áreas de trabajo (inbox-driven)", () => {
  it("ningún área de primer nivel es 'Personas' (no navegación por tabla de DB)", () => {
    expect(WORK_AREAS.some((a) => a.label === "Personas")).toBe(false);
  });

  it("todas las áreas tienen etiqueta-verbo o nombre de trabajo, no de entidad cruda", () => {
    // Las áreas representan trabajos/secciones, no tablas sueltas.
    const labels = WORK_AREAS.map((a) => a.label);
    expect(labels).toContain("Mi bandeja");
    expect(labels).toContain("Originar");
    expect(labels).toContain("Evaluar");
    expect(labels).toContain("Cobrar");
    expect(labels).toContain("Tablero Ejecutivo");
  });

  it("un cobrador ve solo sus áreas (Mi bandeja, Cobrar, Cartera) y no Usuarios", () => {
    const areas = areasVisibles(["cobrador"]).map((a) => a.id);
    expect(areas).toContain("cobrar");
    expect(areas).toContain("cartera");
    expect(areas).toContain("bandeja");
    expect(areas).not.toContain("usuarios");
    expect(areas).not.toContain("evaluar");
  });

  it("un admin ve áreas de todas las secciones", () => {
    const grupos = areasPorSeccion(["admin"]);
    const secciones = grupos.map((g) => g.seccion);
    expect(secciones).toContain("operacion");
    expect(secciones).toContain("control");
    expect(secciones).toContain("direccion");
    expect(secciones).toContain("sistema");
  });

  it("omite secciones enteras cuando el rol no ve ningún área dentro", () => {
    // El cobrador no tiene áreas en 'sistema' ni 'direccion'.
    const grupos = areasPorSeccion(["cobrador"]);
    const secciones = grupos.map((g) => g.seccion);
    expect(secciones).not.toContain("sistema");
    expect(secciones).not.toContain("direccion");
  });

  it("destinosNavegables incluye áreas y sus tabs (para ⌘K)", () => {
    const destinos = destinosNavegables(["admin"]);
    const tos = destinos.map((d) => d.to);
    // área Cartera + sus tabs
    expect(tos).toContain("/prestamos");
    expect(tos).toContain("/pagos");
    expect(tos).toContain("/caja");
  });

  it("sin roles → sin áreas", () => {
    expect(areasVisibles(undefined)).toEqual([]);
    expect(areasPorSeccion(undefined)).toEqual([]);
  });
});
