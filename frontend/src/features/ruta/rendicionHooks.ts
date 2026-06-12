import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

export function useRendicion(id: string | undefined) {
  return useQuery({
    queryKey: ["rendicion", id],
    queryFn: () => apiFetch<Sch["RendicionDetalleOut"]>(`/rendiciones/${id}`),
    enabled: Boolean(id),
  });
}

export function useAgregarDescargo(rendicionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Sch["DescargoIn"]) =>
      apiFetch<Sch["DescargoOut"]>(`/rendiciones/${rendicionId}/descargos`, {
        method: "POST",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rendicion", rendicionId] }),
  });
}

export function useCambiarEstadoRendicion(rendicionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (estado: string) =>
      apiFetch<Sch["RendicionOut"]>(`/rendiciones/${rendicionId}`, {
        method: "PATCH",
        body: { estado },
      }),
    onSuccess: (res) => {
      // Reflect the new lifecycle state immediately (the detail GET keeps the
      // descargos), then refetch in the background.
      qc.setQueryData<Sch["RendicionDetalleOut"]>(["rendicion", rendicionId], (prev) =>
        prev ? { ...prev, estado: res.estado } : prev,
      );
    },
  });
}
