import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { Pagina } from "@/lib/api/queries";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

export type DimensionRentabilidad =
  | "producto"
  | "vendedor"
  | "segmento"
  | "cosecha"
  | "zona";

/** Rentabilidad agregada por dimensión (producto/vendedor/segmento/cosecha/zona). */
export function useRentabilidad(dimension: DimensionRentabilidad) {
  return useQuery({
    queryKey: ["analytics-rentabilidad", dimension],
    queryFn: () =>
      apiFetch<Pagina<Sch["RentabilidadItem"]>>("/analytics/rentabilidad", {
        query: { dimension, per_page: 200 },
      }),
  });
}

/** KPIs globales de rentabilidad de la cartera. */
export function useResumenAnalytics() {
  return useQuery({
    queryKey: ["analytics-resumen"],
    queryFn: () => apiFetch<Sch["ResumenAnalytics"]>("/analytics/resumen"),
  });
}
