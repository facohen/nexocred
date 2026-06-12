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
export function useCashflow() {
  return useQuery({
    queryKey: ["tesoreria-cashflow"],
    queryFn: () => apiFetch<Sch["CashflowOut"]>("/tesoreria/cashflow"),
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
