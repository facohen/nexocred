import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];
interface Pagina<T> {
  data: T[];
}

interface FiltroZonaSector {
  zona_id?: string;
  sector_id?: string;
}

function buildParams(f?: FiltroZonaSector) {
  const p = new URLSearchParams();
  if (f?.zona_id) p.set("zona_id", f.zona_id);
  if (f?.sector_id) p.set("sector_id", f.sector_id);
  return p.toString() ? `?${p.toString()}` : "";
}

export function useTablero(filtro?: FiltroZonaSector) {
  return useQuery({
    queryKey: ["riesgo-tablero", filtro?.zona_id, filtro?.sector_id],
    queryFn: () => apiFetch<Sch["TableroOut"]>(`/riesgo/tablero${buildParams(filtro)}`),
  });
}

export function useCosechas(filtro?: FiltroZonaSector) {
  return useQuery({
    queryKey: ["riesgo-cosechas", filtro?.zona_id, filtro?.sector_id],
    queryFn: () => apiFetch<Pagina<Sch["CosechaOut"]>>(`/riesgo/cosechas${buildParams(filtro)}`),
  });
}

export function useConcentracion(filtro?: FiltroZonaSector) {
  return useQuery({
    queryKey: ["riesgo-concentracion", filtro?.zona_id, filtro?.sector_id],
    queryFn: () => apiFetch<Pagina<Sch["ConcentracionItem"]>>(`/riesgo/concentracion${buildParams(filtro)}`),
  });
}

export function useAlertas() {
  return useQuery({
    queryKey: ["alertas"],
    queryFn: () => apiFetch<Pagina<Sch["AlertaOut"]>>("/alertas"),
  });
}

export function useResolverAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; justificacion: string }) =>
      apiFetch<Sch["AlertaOut"]>(`/alertas/${vars.id}/resolver`, {
        method: "POST",
        body: { justificacion: vars.justificacion },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });
}

export function useAsignarAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; operadorId: string }) =>
      apiFetch<Sch["AlertaOut"]>(`/alertas/${vars.id}/asignar`, {
        method: "POST",
        body: { operador_id: vars.operadorId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas", "tareas"] }),
  });
}
