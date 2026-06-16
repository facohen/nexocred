import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

// InteraccionIn extendido: el schema TS generado es un subconjunto del modelo
// backend real (que incluye tema_id, canal_id, disposicion_id, etc.).
export interface InteraccionIn {
  persona_id: string;
  tipo: string;
  detalle?: string | null;
  tarea_id?: string | null;
  tema_id?: string | null;
  canal_id?: string | null;
  disposicion_id?: string | null;
  credito_id?: string | null;
  proximo_paso_fecha?: string | null;
  proximo_paso_nota?: string | null;
}
interface Pagina<T> {
  data: T[];
}

export function useTareas() {
  return useQuery({
    queryKey: ["tareas"],
    queryFn: () => apiFetch<Pagina<Sch["TareaOut"]>>("/tareas"),
  });
}

export function useCompletarTarea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; detalle: string }) =>
      apiFetch<Sch["InteraccionOut"]>(`/tareas/${vars.id}/completar`, {
        method: "POST",
        body: { detalle: vars.detalle },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tareas"] }),
  });
}

export function useIncidentes() {
  return useQuery({
    queryKey: ["incidentes"],
    queryFn: () => apiFetch<Pagina<Sch["IncidenteOut"]>>("/incidentes"),
  });
}

export function useCrearIncidente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Sch["IncidenteIn"]) =>
      apiFetch<Sch["IncidenteOut"]>("/incidentes", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidentes"] }),
  });
}

export function useTimeline(personaId: string | undefined) {
  return useQuery({
    queryKey: ["timeline", personaId],
    queryFn: () => apiFetch<Pagina<Sch["TimelineEvento"]>>(`/personas/${personaId}/timeline`),
    enabled: Boolean(personaId),
  });
}

export function useProspectos() {
  return useQuery({
    queryKey: ["prospectos"],
    queryFn: () => apiFetch<Pagina<Sch["ProspectoOut"]>>("/prospectos"),
  });
}

export function usePromoverProspecto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Sch["ProspectoOut"]>(`/prospectos/${id}`, {
        method: "PATCH",
        body: { estado: "convertido" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospectos"] }),
  });
}

export function useAsignarMasivo() {
  return useMutation({
    mutationFn: (body: { operador_id: string; persona_ids: string[] }) =>
      apiFetch<{ asignadas: number }>("/crm/asignaciones/masivo", { method: "POST", body }),
  });
}

export function useAsignar() {
  return useMutation({
    mutationFn: (body: Sch["AsignacionIn"]) =>
      apiFetch<Sch["AsignacionOut"]>("/crm/asignaciones", { method: "POST", body }),
  });
}

export function useFicha360(personaId: string | undefined) {
  return useQuery({
    queryKey: ["ficha360", personaId],
    queryFn: () =>
      apiFetch<{
        persona_id: string;
        exposicion_total: string;
        peor_bucket_dias: number;
        prestamos_activos: number;
        promesas_vigentes: number;
      }>(`/personas/${personaId}/ficha360`),
    enabled: Boolean(personaId),
  });
}

export function useCrearInteraccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InteraccionIn) =>
      apiFetch<Sch["InteraccionOut"]>("/interacciones", { method: "POST", body }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["timeline", vars.persona_id] });
    },
  });
}

export function usePromesas(prestamoId?: string, estado?: string) {
  const params = new URLSearchParams();
  if (prestamoId) params.set("prestamo_id", prestamoId);
  if (estado) params.set("estado", estado);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return useQuery({
    queryKey: ["promesas", prestamoId, estado],
    queryFn: () =>
      apiFetch<{
        data: Array<{
          id: string;
          prestamo_id: string;
          monto_prometido: string;
          fecha_prometida: string;
          estado: string;
          canal_origen: string | null;
        }>;
      }>(`/promesas${qs}`),
  });
}
