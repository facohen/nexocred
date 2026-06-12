import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

export function useResumen() {
  return useQuery({
    queryKey: ["torre-resumen"],
    queryFn: () => apiFetch<Sch["ResumenOut"]>("/torre/resumen"),
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
