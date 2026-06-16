import { describe, it, expect } from "vitest";
import {
  type FiltroCartera,
  type AccessoresFiltro,
  FILTRO_CARTERA_VACIO,
  filtrarCartera,
  filtroActivo,
} from "./filtros";

interface Fila {
  estado: string;
  fecha: string; // ISO YYYY-MM-DD
  monto: string; // string canónico
}

const acc: AccessoresFiltro<Fila> = {
  estado: (f) => f.estado,
  fecha: (f) => f.fecha,
  monto: (f) => f.monto,
};

// Fechas relativas a hoy para no acoplar el test a una fecha fija.
function hace(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

const filas: Fila[] = [
  { estado: "vigente", fecha: hace(5), monto: "100000.00" },
  { estado: "en_mora", fecha: hace(45), monto: "500000.00" },
  { estado: "pagado", fecha: hace(200), monto: "50000.00" },
];

function con(parcial: Partial<FiltroCartera>): FiltroCartera {
  return { ...FILTRO_CARTERA_VACIO, ...parcial };
}

describe("filtrarCartera", () => {
  it("sin filtros devuelve todo", () => {
    expect(filtrarCartera(filas, acc, FILTRO_CARTERA_VACIO)).toHaveLength(3);
  });

  it("filtra por estado exacto", () => {
    const r = filtrarCartera(filas, acc, con({ estado: "vigente" }));
    expect(r).toHaveLength(1);
    expect(r[0].estado).toBe("vigente");
  });

  it("rango 'mes' deja solo lo de los últimos 30 días", () => {
    const r = filtrarCartera(filas, acc, con({ rango: "mes" }));
    expect(r.map((f) => f.estado)).toEqual(["vigente"]);
  });

  it("rango '90dias' incluye hasta 90 días atrás", () => {
    const r = filtrarCartera(filas, acc, con({ rango: "90dias" }));
    expect(r.map((f) => f.estado).sort()).toEqual(["en_mora", "vigente"]);
  });

  it("filtra por monto mínimo", () => {
    const r = filtrarCartera(filas, acc, con({ montoMin: "100000.00" }));
    expect(r.map((f) => f.estado).sort()).toEqual(["en_mora", "vigente"]);
  });

  it("filtra por rango de montos [min, max]", () => {
    const r = filtrarCartera(filas, acc, con({ montoMin: "60000.00", montoMax: "200000.00" }));
    expect(r.map((f) => f.estado)).toEqual(["vigente"]);
  });

  it("combina estado + período + monto", () => {
    const r = filtrarCartera(
      filas,
      acc,
      con({ rango: "90dias", montoMin: "200000.00" }),
    );
    expect(r.map((f) => f.estado)).toEqual(["en_mora"]);
  });
});

describe("filtroActivo", () => {
  it("es false con el filtro vacío", () => {
    expect(filtroActivo(FILTRO_CARTERA_VACIO)).toBe(false);
  });

  it("es true si hay cualquier criterio", () => {
    expect(filtroActivo(con({ estado: "vigente" }))).toBe(true);
    expect(filtroActivo(con({ rango: "mes" }))).toBe(true);
    expect(filtroActivo(con({ montoMin: "1.00" }))).toBe(true);
  });
});
