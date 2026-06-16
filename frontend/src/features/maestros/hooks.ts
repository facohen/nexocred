import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface CatalogoOut {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface DisposicionOut extends CatalogoOut {
  genera_cobro: boolean;
}

export interface ProvinciaOut {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface LocalidadOut {
  id: string;
  provincia_id: string;
  codigo: string | null;
  nombre: string;
  activo: boolean;
}

export interface AsignacionVendedorOut {
  id: string;
  vendedor_id: string;
  zona_id: string;
  sector_id: string;
  vigente_desde: string;
  vigente_hasta: string | null;
}

export interface VendedorConAsignacionOut {
  id: string;
  nombre: string;
  email: string;
  asignacion_vigente: AsignacionVendedorOut | null;
}

// ---------- Zonas ----------
export function useZonas() {
  return useQuery({
    queryKey: ["maestros", "zonas"],
    queryFn: () => apiFetch<Pagina<CatalogoOut>>("/maestros/zonas?per_page=500"),
  });
}

export function useCrearZona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { codigo: string; nombre: string; orden?: number }) =>
      apiFetch<CatalogoOut>("/maestros/zonas", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "zonas"] }),
  });
}

export function useActualizarZona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; nombre?: string; orden?: number; activo?: boolean }) =>
      apiFetch<CatalogoOut>(`/maestros/zonas/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "zonas"] }),
  });
}

// ---------- Sectores ----------
export function useSectores() {
  return useQuery({
    queryKey: ["maestros", "sectores"],
    queryFn: () => apiFetch<Pagina<CatalogoOut>>("/maestros/sectores?per_page=500"),
  });
}

export function useCrearSector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { codigo: string; nombre: string; orden?: number }) =>
      apiFetch<CatalogoOut>("/maestros/sectores", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "sectores"] }),
  });
}

export function useActualizarSector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; nombre?: string; orden?: number; activo?: boolean }) =>
      apiFetch<CatalogoOut>(`/maestros/sectores/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "sectores"] }),
  });
}

// ---------- Temas ----------
export function useTemas() {
  return useQuery({
    queryKey: ["maestros", "temas"],
    queryFn: () => apiFetch<Pagina<CatalogoOut>>("/maestros/temas?per_page=500"),
  });
}

export function useCrearTema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { codigo: string; nombre: string; orden?: number }) =>
      apiFetch<CatalogoOut>("/maestros/temas", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "temas"] }),
  });
}

export function useActualizarTema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; nombre?: string; orden?: number; activo?: boolean }) =>
      apiFetch<CatalogoOut>(`/maestros/temas/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "temas"] }),
  });
}

// ---------- Canales ----------
export function useCanales() {
  return useQuery({
    queryKey: ["maestros", "canales"],
    queryFn: () => apiFetch<Pagina<CatalogoOut>>("/maestros/canales?per_page=500"),
  });
}

export function useCrearCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { codigo: string; nombre: string; orden?: number }) =>
      apiFetch<CatalogoOut>("/maestros/canales", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "canales"] }),
  });
}

export function useActualizarCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; nombre?: string; orden?: number; activo?: boolean }) =>
      apiFetch<CatalogoOut>(`/maestros/canales/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "canales"] }),
  });
}

// ---------- Disposiciones ----------
export function useDisposiciones() {
  return useQuery({
    queryKey: ["maestros", "disposiciones"],
    queryFn: () => apiFetch<Pagina<DisposicionOut>>("/maestros/disposiciones?per_page=500"),
  });
}

export function useCrearDisposicion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { codigo: string; nombre: string; genera_cobro?: boolean; orden?: number }) =>
      apiFetch<DisposicionOut>("/maestros/disposiciones", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "disposiciones"] }),
  });
}

export function useActualizarDisposicion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      nombre?: string;
      genera_cobro?: boolean;
      orden?: number;
      activo?: boolean;
    }) => apiFetch<DisposicionOut>(`/maestros/disposiciones/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "disposiciones"] }),
  });
}

// ---------- Provincias ----------
export function useProvincias() {
  return useQuery({
    queryKey: ["maestros", "provincias"],
    queryFn: () => apiFetch<Pagina<ProvinciaOut>>("/maestros/provincias?per_page=500"),
  });
}

// ---------- Localidades ----------
export function useLocalidades(provinciaId?: string) {
  return useQuery({
    queryKey: ["maestros", "localidades", provinciaId],
    queryFn: () =>
      apiFetch<Pagina<LocalidadOut>>(
        `/maestros/localidades?per_page=1000${provinciaId ? `&provincia_id=${provinciaId}` : ""}`,
      ),
    enabled: !!provinciaId,
  });
}

export function useCrearLocalidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { provincia_id: string; nombre: string; codigo?: string }) =>
      apiFetch<LocalidadOut>("/maestros/localidades", { method: "POST", body }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["maestros", "localidades", vars.provincia_id] });
    },
  });
}

// ---------- Vendedores ----------
export function useVendedores() {
  return useQuery({
    queryKey: ["maestros", "vendedores"],
    queryFn: () => apiFetch<VendedorConAsignacionOut[]>("/maestros/vendedores"),
  });
}

export function useAsignarVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      vendedorId,
      ...body
    }: {
      vendedorId: string;
      zona_id: string;
      sector_id: string;
      vigente_desde: string;
    }) =>
      apiFetch<AsignacionVendedorOut>(`/maestros/vendedores/${vendedorId}/asignacion`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maestros", "vendedores"] }),
  });
}
