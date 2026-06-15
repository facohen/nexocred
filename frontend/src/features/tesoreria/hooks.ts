import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

export function usePosicion() {
  return useQuery({
    queryKey: ["tesoreria-posicion"],
    queryFn: () => apiFetch<Sch["PosicionOut"]>("/tesoreria/posicion"),
  });
}
// Cashflow proyectado. Opcionalmente por horizontes en meses (ej [3,6,12,24,36]);
// sin ellos cae al comportamiento por defecto (tramos por días 30/60/90).
export function useCashflow(horizontesMeses?: number[]) {
  const horizontes = horizontesMeses?.length ? horizontesMeses.join(",") : undefined;
  return useQuery({
    queryKey: ["tesoreria-cashflow", horizontes ?? ""],
    queryFn: () => apiFetch<Sch["CashflowOut"]>("/tesoreria/cashflow", { query: { horizontes } }),
  });
}
export function useDcf() {
  return useQuery({
    queryKey: ["tesoreria-dcf"],
    queryFn: () => apiFetch<Sch["DCFOut"]>("/tesoreria/dcf"),
  });
}
export function useRotacion() {
  return useQuery({
    queryKey: ["tesoreria-rotacion"],
    queryFn: () => apiFetch<Sch["RotacionOut"]>("/tesoreria/rotacion"),
  });
}
