import { compareMoney } from "./money";

/**
 * Filtros reutilizables de cartera (préstamos, solicitudes, pagos, etc.).
 *
 * Pensado para filtrar EN EL CLIENTE sobre datos ya cargados: cualquier pantalla
 * que liste registros con un estado, una fecha y un monto puede reusar el mismo
 * tipo `FiltroCartera`, el mismo control de UI (CarteraFilter) y el mismo
 * predicado (`pasaFiltro`), aportando accessors a sus propios campos.
 */

/** Ventanas de tiempo relativas. "todos" = sin filtro de fecha. */
export type RangoFecha = "todos" | "mes" | "90dias";

export interface FiltroCartera {
  /** estado exacto, o "" para todos los estados */
  estado: string;
  rango: RangoFecha;
  /** montos como string canónico ("<int>.<2dec>"), o "" si no se acota ese borde */
  montoMin: string;
  montoMax: string;
}

export const FILTRO_CARTERA_VACIO: FiltroCartera = {
  estado: "",
  rango: "todos",
  montoMin: "",
  montoMax: "",
};

export const RANGO_LABELS: Record<RangoFecha, string> = {
  todos: "Todos",
  mes: "Último mes",
  "90dias": "Últimos 90 días",
};

const DIAS_POR_RANGO: Record<Exclude<RangoFecha, "todos">, number> = {
  mes: 30,
  "90dias": 90,
};

/** ISO YYYY-MM-DD de hace `dias` días desde hoy. Sin Date.now en módulo. */
function fechaCorte(dias: number): string {
  const corte = new Date();
  corte.setDate(corte.getDate() - dias);
  return corte.toISOString().slice(0, 10);
}

/** True si la fecha ISO (o datetime ISO) cae dentro de la ventana del rango. */
function fechaEnRango(fechaIso: string | null | undefined, rango: RangoFecha): boolean {
  if (rango === "todos") return true;
  if (!fechaIso) return false;
  // Comparación lexicográfica sobre el prefijo YYYY-MM-DD (ISO ordena cronológicamente).
  return fechaIso.slice(0, 10) >= fechaCorte(DIAS_POR_RANGO[rango]);
}

/** True si el monto string está dentro de [min, max] (bordes vacíos = sin límite). */
function montoEnRango(monto: string | null | undefined, min: string, max: string): boolean {
  if (min === "" && max === "") return true;
  if (monto == null || monto === "") return false;
  if (min !== "" && compareMoney(monto, min) < 0) return false;
  if (max !== "" && compareMoney(monto, max) > 0) return false;
  return true;
}

/** Accessors que mapean un registro arbitrario a los campos que el filtro usa. */
export interface AccessoresFiltro<T> {
  estado: (item: T) => string | null | undefined;
  fecha: (item: T) => string | null | undefined;
  monto: (item: T) => string | null | undefined;
}

/** Predicado puro: ¿el item pasa el filtro? Reusable con cualquier T vía accessors. */
export function pasaFiltro<T>(
  item: T,
  acc: AccessoresFiltro<T>,
  filtro: FiltroCartera,
): boolean {
  if (filtro.estado && acc.estado(item) !== filtro.estado) return false;
  if (!fechaEnRango(acc.fecha(item), filtro.rango)) return false;
  if (!montoEnRango(acc.monto(item), filtro.montoMin, filtro.montoMax)) return false;
  return true;
}

/** Aplica el filtro a una lista. Azúcar sobre `pasaFiltro`. */
export function filtrarCartera<T>(
  items: T[],
  acc: AccessoresFiltro<T>,
  filtro: FiltroCartera,
): T[] {
  return items.filter((i) => pasaFiltro(i, acc, filtro));
}

/** True si el filtro tiene algún criterio activo (para mostrar "limpiar", contadores, etc.). */
export function filtroActivo(filtro: FiltroCartera): boolean {
  return (
    filtro.estado !== "" ||
    filtro.rango !== "todos" ||
    filtro.montoMin !== "" ||
    filtro.montoMax !== ""
  );
}
