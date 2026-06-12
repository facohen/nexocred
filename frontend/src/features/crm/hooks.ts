import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];
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
