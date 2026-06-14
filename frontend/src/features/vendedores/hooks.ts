import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { newIdempotencyKey } from "@/lib/utils";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export function useComisiones(vendedorId: string) {
  return useQuery({
    queryKey: ["comisiones", vendedorId],
    queryFn: () => apiFetch<Sch["ComisionDevengoOut"][]>(`/vendedores/${vendedorId}/comisiones`),
  });
}

// El backend pagina liquidaciones: { data, total, page, per_page }. Desenvolvemos
// a un array pelado para que los consumidores (TesoreriaHome, LiquidacionesPage)
// hagan .filter/.map sin crashear, y el cache de aprobar/pagar siga siendo un array.
export function useLiquidaciones() {
  return useQuery({
    queryKey: ["liquidaciones"],
    queryFn: async () => {
      const res = await apiFetch<Pagina<Sch["LiquidacionOut"]>>("/comisiones/liquidaciones");
      return res.data;
    },
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
