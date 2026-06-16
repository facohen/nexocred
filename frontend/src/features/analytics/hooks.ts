import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { Pagina } from "@/lib/api/queries";
import type { components } from "@/lib/api/schema";
import type { FiltroZonaSector } from "@/components/filters/DashboardFilterBar";

type Sch = components["schemas"];

export type DimensionRentabilidad = "producto" | "vendedor" | "segmento" | "cosecha" | "zona";

function zonaParams(filtro?: FiltroZonaSector) {
  return {
    ...(filtro?.zona_id ? { zona_id: filtro.zona_id } : {}),
    ...(filtro?.sector_id ? { sector_id: filtro.sector_id } : {}),
  };
}

/** Rentabilidad agregada por dimensión (producto/vendedor/segmento/cosecha/zona). */
export function useRentabilidad(dimension: DimensionRentabilidad, filtro?: FiltroZonaSector) {
  return useQuery({
    queryKey: ["analytics-rentabilidad", dimension, filtro?.zona_id ?? "", filtro?.sector_id ?? ""],
    queryFn: () =>
      apiFetch<Pagina<Sch["RentabilidadItem"]>>("/analytics/rentabilidad", {
        query: { dimension, per_page: 200, ...zonaParams(filtro) },
      }),
  });
}

/** KPIs globales de rentabilidad de la cartera. */
export function useResumenAnalytics(filtro?: FiltroZonaSector) {
  return useQuery({
    queryKey: ["analytics-resumen", filtro?.zona_id ?? "", filtro?.sector_id ?? ""],
    queryFn: () =>
      apiFetch<Sch["ResumenAnalytics"]>("/analytics/resumen", { query: zonaParams(filtro) }),
  });
}
