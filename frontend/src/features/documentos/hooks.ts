import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { newIdempotencyKey } from "@/lib/utils";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

export function useDocumentos(prestamoId: string) {
  return useQuery({
    queryKey: ["documentos", prestamoId],
    queryFn: () => apiFetch<{ data: Sch["DocumentoOut"][] }>(`/prestamos/${prestamoId}/documentos`),
  });
}

export function useGenerarDocumento(prestamoId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Money/legal-creating action → Idempotency-Key to avoid emitting a
    // duplicate numbered document on retry.
    mutationFn: (tipo: string) =>
      apiFetch<Sch["DocumentoOut"]>("/documentos/generar", {
        method: "POST",
        body: { tipo, prestamo_id: prestamoId },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentos", prestamoId] }),
  });
}

export function useAnularDocumento(prestamoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; motivo: string }) =>
      apiFetch<Sch["DocumentoOut"]>(`/documentos/${vars.id}/anular`, {
        method: "POST",
        body: { motivo: vars.motivo },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentos", prestamoId] }),
  });
}

export async function descargarDocumento(id: string): Promise<string> {
  const res = await apiFetch<{ url: string }>(`/documentos/${id}/descargar`);
  return res.url;
}
