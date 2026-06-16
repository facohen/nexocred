import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { FiltroZonaSector } from "@/components/filters/DashboardFilterBar";

type Sch = components["schemas"];

function zonaParams(filtro?: FiltroZonaSector) {
  return {
    ...(filtro?.zona_id ? { zona_id: filtro.zona_id } : {}),
    ...(filtro?.sector_id ? { sector_id: filtro.sector_id } : {}),
  };
}

export function useResumen(filtro?: FiltroZonaSector) {
  return useQuery({
    queryKey: ["torre-resumen", filtro?.zona_id ?? "", filtro?.sector_id ?? ""],
    queryFn: () => apiFetch<Sch["ResumenOut"]>("/torre/resumen", { query: zonaParams(filtro) }),
  });
}
export function usePulso() {
  return useQuery({
    queryKey: ["torre-pulso"],
    queryFn: () => apiFetch<Sch["PulsoOut"]>("/torre/pulso"),
  });
}
export function useSaludCartera() {
  return useQuery({
    queryKey: ["torre-salud"],
    queryFn: () => apiFetch<Sch["SaludCarteraOut"]>("/torre/salud-cartera"),
  });
}
export function useOperacionHoy() {
  return useQuery({
    queryKey: ["torre-operacion"],
    queryFn: () => apiFetch<Sch["OperacionHoyOut"]>("/torre/operacion-hoy"),
  });
}
export function useNegocio() {
  return useQuery({
    queryKey: ["torre-negocio"],
    queryFn: () => apiFetch<Sch["NegocioOut"]>("/torre/negocio"),
  });
}
export function useAlertasLive() {
  return useQuery({
    queryKey: ["torre-alertas-live"],
    queryFn: () => apiFetch<Sch["AlertasLiveOut"]>("/torre/alertas-live"),
  });
}
