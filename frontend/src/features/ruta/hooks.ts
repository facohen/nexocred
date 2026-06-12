import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Sch = components["schemas"];

interface Pagina<T> {
  data: T[];
}

/** The cobrador's assigned routes. */
export function useRutas() {
  return useQuery({
    queryKey: ["rutas"],
    queryFn: () => apiFetch<Pagina<Sch["RutaOut"]>>("/rutas"),
  });
}

/** A route with its stops + exigible saldo per stop. */
export function useRuta(id: string | undefined) {
  return useQuery({
    queryKey: ["ruta", id],
    queryFn: () => apiFetch<Sch["RutaDetalleOut"]>(`/rutas/${id}`),
    enabled: Boolean(id),
  });
}

export function useParadas(rutaId: string | undefined) {
  return useQuery({
    queryKey: ["paradas", rutaId],
    queryFn: () => apiFetch<Pagina<Sch["ParadaConSaldoOut"]>>(`/rutas/${rutaId}/paradas`),
    enabled: Boolean(rutaId),
  });
}
