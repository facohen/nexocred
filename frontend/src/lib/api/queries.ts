import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { newIdempotencyKey } from "@/lib/utils";
import type { components } from "./schema";

type Sch = components["schemas"];

interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ---- Personas ----
export function usePersonas(q?: string) {
  return useQuery({
    queryKey: ["personas", q ?? ""],
    queryFn: () => apiFetch<Pagina<Sch["PersonaListItem"]>>("/personas", { query: { q } }),
  });
}

export function usePersona(id: string) {
  return useQuery({
    queryKey: ["persona", id],
    queryFn: () => apiFetch<Sch["PersonaOut"]>(`/personas/${id}`),
  });
}

export function useCrearPersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Sch["PersonaCreate"]) =>
      apiFetch<Sch["PersonaOut"]>("/personas", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personas"] }),
  });
}

export function useDeudaBcra(personaId: string) {
  return useQuery({
    queryKey: ["bcra", personaId],
    queryFn: () => apiFetch<{ data: Sch["DeudaBcraOut"][] }>(`/personas/${personaId}/deuda-bcra`),
  });
}

export function useSyncBcra(personaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ data: Sch["DeudaBcraOut"][] }>(`/personas/${personaId}/deuda-bcra/sync`, {
        method: "POST",
        body: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bcra", personaId] }),
  });
}

// ---- Productos / simulador ----
export function useProductos() {
  return useQuery({
    queryKey: ["productos"],
    queryFn: () => apiFetch<Pagina<Sch["ProductoOut"]>>("/productos"),
  });
}

export function useProducto(id: string) {
  return useQuery({
    queryKey: ["producto", id],
    queryFn: () => apiFetch<Sch["ProductoOut"]>(`/productos/${id}`),
  });
}

export function useMatrizTasas() {
  return useQuery({
    queryKey: ["matriz-tasas"],
    queryFn: () =>
      apiFetch<{ data: { producto_id: string; perfil_pricing_id: string; plazo: number; tasa: string }[] }>(
        "/matrices/tasas",
      ),
  });
}

export function useSimular() {
  return useMutation({
    mutationFn: (vars: { tipo: "otorgante" | "cotizador" | "interno"; body: unknown }) =>
      apiFetch<Sch["SimuladorOut"]>(`/simulador/${vars.tipo}`, { method: "POST", body: vars.body }),
  });
}

// ---- Solicitudes ----
export function useSolicitudes() {
  return useQuery({
    queryKey: ["solicitudes"],
    queryFn: () => apiFetch<Pagina<Sch["SolicitudOut"]>>("/solicitudes"),
  });
}

export function useCrearSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    // Crear solicitud NO crea plata (queda en borrador) → sin Idempotency-Key.
    // El backend atribuye el vendedor automáticamente cuando el actor es vendedor
    // (ignora vendedor_id del body en ese caso); admin/analista pueden fijarlo.
    mutationFn: (body: Sch["SolicitudCreate"]) =>
      apiFetch<Sch["SolicitudOut"]>("/solicitudes", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solicitudes"] }),
  });
}

export function useSolicitud(id: string) {
  return useQuery({
    queryKey: ["solicitud", id],
    queryFn: () => apiFetch<Sch["SolicitudOut"]>(`/solicitudes/${id}`),
  });
}

export function useChecklist(id: string) {
  return useQuery({
    queryKey: ["checklist", id],
    queryFn: () =>
      apiFetch<{ checklist: { regla: string; etiqueta: string; ok: boolean; detalle: string }[] }>(
        `/solicitudes/${id}/validar-politicas`,
        { method: "POST", body: {} },
      ),
  });
}

export function useAccionSolicitud(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      accion: "evaluar" | "simular" | "desembolsar";
      body?: unknown;
      idempotencyKey?: string;
    }) =>
      apiFetch(`/solicitudes/${id}/${vars.accion}`, {
        method: "POST",
        body: vars.body ?? {},
        // Money-creating actions (desembolsar) require an Idempotency-Key to
        // prevent a double disbursement. evaluar/simular are idempotent reads
        // and must NOT carry one. The caller may pass a stable key to reuse it
        // across retries of the same intent.
        idempotencyKey:
          vars.accion === "desembolsar"
            ? vars.idempotencyKey ?? newIdempotencyKey()
            : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solicitud", id] }),
  });
}

// ---- Préstamos ----
export function usePrestamos() {
  return useQuery({
    queryKey: ["prestamos"],
    queryFn: () => apiFetch<Pagina<Sch["PrestamoOut"]>>("/prestamos"),
  });
}

export function usePrestamo(id: string) {
  return useQuery({
    queryKey: ["prestamo", id],
    queryFn: () => apiFetch<Sch["PrestamoOut"]>(`/prestamos/${id}`),
  });
}

// El backend devuelve un array pelado de CuotaOut (sin wrapper {data}, sin campo
// `saldo`). No lo envolvemos: el consumidor usa el array directo.
export function useCuotas(id: string) {
  return useQuery({
    queryKey: ["cuotas", id],
    queryFn: () => apiFetch<Sch["CuotaOut"][]>(`/prestamos/${id}/cuotas`),
  });
}

export function usePagosDePrestamo(id: string) {
  return useQuery({
    queryKey: ["pagos-prestamo", id],
    queryFn: () => apiFetch<{ data: Sch["PagoDetalleOut"][] }>(`/prestamos/${id}/pagos`),
  });
}

// El backend EXIGE ?fecha_negocio=YYYY-MM-DD (sin él da 422). Por defecto usamos
// la fecha de hoy; el caller puede pasar otra para proyectar el saldo.
export function usePayoff(id: string, fechaNegocio?: string) {
  const fecha = fechaNegocio ?? new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["payoff", id, fecha],
    queryFn: () =>
      apiFetch<Sch["PayoffOut"]>(`/prestamos/${id}/payoff`, { query: { fecha_negocio: fecha } }),
  });
}

// ---- Pagos ----
export function useRegistrarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { body: Sch["PagoCreate"]; idempotencyKey?: string }) =>
      apiFetch<Sch["PagoDetalleOut"]>("/pagos", {
        method: "POST",
        body: vars.body,
        idempotencyKey: vars.idempotencyKey ?? newIdempotencyKey(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pagos-prestamo"] }),
  });
}

export function useCorregirPago() {
  return useMutation({
    // Acción que crea plata (contra-asiento + pago de reemplazo) → la
    // Idempotency-Key DEBE ser estable por intento: el caller la genera una vez
    // (useMemo) y la pasa, para que un retry tras timeout no genere una segunda
    // corrección. Si no la pasa, caemos a una key fresca (peor, pero no rompe).
    mutationFn: (vars: { pagoId: string; body?: unknown; idempotencyKey?: string }) =>
      apiFetch<Sch["CorreccionOut"]>(`/pagos/${vars.pagoId}/corregir`, {
        method: "POST",
        body: vars.body ?? {},
        idempotencyKey: vars.idempotencyKey ?? newIdempotencyKey(),
      }),
  });
}

// ---- Cajas ----
export function useCajas() {
  return useQuery({
    queryKey: ["cajas"],
    queryFn: () => apiFetch<{ data: Sch["CajaOut"][] }>("/cajas"),
  });
}

export function usePosicionConsolidada() {
  return useQuery({
    queryKey: ["posicion-consolidada"],
    queryFn: () => apiFetch<Sch["PosicionConsolidadaOut"]>("/cajas/posicion-consolidada"),
  });
}

export function useMovimientos(cajaId: string) {
  return useQuery({
    queryKey: ["movimientos", cajaId],
    queryFn: () => apiFetch<{ data: Sch["MovimientoOut"][] }>(`/cajas/${cajaId}/movimientos`),
    enabled: Boolean(cajaId),
  });
}

// ---- Novaciones ----
export function useNovacion() {
  return useMutation({
    // Acción que crea plata (cancela préstamos y emite uno nuevo) → Idempotency-Key
    // estable por intento, provista por el caller (useMemo). Un retry tras timeout
    // NO debe generar una segunda novación.
    mutationFn: (vars: {
      tipo: "refinanciar" | "consolidar" | "transferir" | "repactar-rapido";
      body: unknown;
      idempotencyKey?: string;
    }) =>
      apiFetch<Sch["NovacionDetalleOut"]>(`/novaciones/${vars.tipo}`, {
        method: "POST",
        body: vars.body,
        idempotencyKey: vars.idempotencyKey ?? newIdempotencyKey(),
      }),
  });
}
