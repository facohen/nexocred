import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { newIdempotencyKey } from "@/lib/utils";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

export function useComisiones(vendedorId: string) {
  return useQuery({
    queryKey: ["comisiones", vendedorId],
    queryFn: () => apiFetch<Sch["ComisionDevengoOut"][]>(`/vendedores/${vendedorId}/comisiones`),
  });
}

export function useLiquidaciones() {
  return useQuery({
    queryKey: ["liquidaciones"],
    queryFn: () => apiFetch<Sch["LiquidacionOut"][]>("/comisiones/liquidaciones"),
  });
}

export function useGenerarLiquidacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Sch["GenerarLiquidacionIn"]) =>
      apiFetch<Sch["LiquidacionOut"]>("/comisiones/liquidaciones", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["liquidaciones"] }),
  });
}

export function useAprobarLiquidacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Sch["LiquidacionOut"]>(`/comisiones/liquidaciones/${id}/aprobar`, {
        method: "POST",
        body: {},
      }),
    onSuccess: (res) =>
      qc.setQueryData<Sch["LiquidacionOut"][]>(["liquidaciones"], (prev) =>
        prev?.map((l) => (l.id === res.id ? res : l)),
      ),
  });
}

export function usePagarLiquidacion() {
  const qc = useQueryClient();
  return useMutation({
    // Money-creating action (caja egreso) → Idempotency-Key to avoid a double
    // payout on retry.
    mutationFn: (id: string) =>
      apiFetch<Sch["LiquidacionOut"]>(`/comisiones/liquidaciones/${id}/pagar`, {
        method: "POST",
        body: {},
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (res) =>
      qc.setQueryData<Sch["LiquidacionOut"][]>(["liquidaciones"], (prev) =>
        prev?.map((l) => (l.id === res.id ? res : l)),
      ),
  });
}
