import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];
interface Pagina<T> {
  data: T[];
}

export function useTablero() {
  return useQuery({
    queryKey: ["riesgo-tablero"],
    queryFn: () => apiFetch<Sch["TableroOut"]>("/riesgo/tablero"),
  });
}

export function useCosechas() {
  return useQuery({
    queryKey: ["riesgo-cosechas"],
    queryFn: () => apiFetch<Pagina<Sch["CosechaOut"]>>("/riesgo/cosechas"),
  });
}

export function useConcentracion() {
  return useQuery({
    queryKey: ["riesgo-concentracion"],
    queryFn: () => apiFetch<Pagina<Sch["ConcentracionItem"]>>("/riesgo/concentracion"),
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
