import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { newIdempotencyKey } from "@/lib/utils";
import type { components } from "./schema";

type Sch = components["schemas"];

export interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ---- Personas ----
// GET /personas filtra por ?nombre / ?dni / ?cuil y, para roles de lectura
// global, por ?vendedor_id. Un vendedor recibe SU cartera scopeada por el
// backend aunque no pase vendedor_id; pasarlo es para que admin/ceo filtren.
export function usePersonas(filtros?: { nombre?: string; vendedorId?: string }) {
  const nombre = filtros?.nombre?.trim() || undefined;
  const vendedorId = filtros?.vendedorId;
  return useQuery({
    queryKey: ["personas", nombre ?? "", vendedorId ?? ""],
    queryFn: () =>
      apiFetch<Pagina<Sch["PersonaListItem"]>>("/personas", {
        query: { nombre, vendedor_id: vendedorId },
      }),
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

// ---- Metas de vendedor ----
// GET /vendedores/{id}/metas/{periodo} → meta del período con avance real
// (monto_colocado / cantidad_colocada calculados en el backend desde los
// desembolsos). El backend devuelve avance aunque no haya meta fijada (meta 0).
export function useMetaVendedor(vendedorId: string | null, periodo: string) {
  return useQuery({
    queryKey: ["meta-vendedor", vendedorId ?? "", periodo],
    enabled: Boolean(vendedorId),
    queryFn: () => apiFetch<Sch["MetaVendedorOut"]>(`/vendedores/${vendedorId}/metas/${periodo}`),
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
      apiFetch<{
        data: { producto_id: string; perfil_pricing_id: string; plazo: number; tasa: string }[];
      }>("/matrices/tasas"),
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
    // id vacío (p. ej. split-view sin selección) NO debe disparar un GET
    // /solicitudes/ inválido. La query queda inactiva hasta tener un id real.
    enabled: Boolean(id),
  });
}

/** Fila de checklist lista para la UI, derivada del ChecklistOut plano del backend. */
export interface ChecklistFila {
  regla: string;
  etiqueta: string;
  ok: boolean;
  detalle: string;
}

// El backend expone validar-politicas como GET y devuelve un mapa plano
// regla→boolean (ChecklistOut). Estas etiquetas (orden incluido) traducen ese
// mapa a las filas que renderiza SolicitudDetailPage. La clave "bcra" debe
// conservarse: el guard de aprobación la busca por nombre (fail-safe).
// `negativa: true` marca una regla donde el flag del backend es un problema
// cuando es true (mora_previa: hay mora previa = malo). Las demás son positivas:
// true = cumple. La UI muestra OK/No cumple según la regla, no según el bool crudo.
const REGLAS_CHECKLIST: {
  regla: keyof Sch["ChecklistOut"];
  etiqueta: string;
  negativa?: boolean;
}[] = [
  { regla: "edad", etiqueta: "Edad dentro del rango" },
  { regla: "cuota_ingreso", etiqueta: "Relación cuota/ingreso" },
  { regla: "bcra", etiqueta: "Situación BCRA" },
  { regla: "mora_previa", etiqueta: "Sin mora interna", negativa: true },
];

function aFilasChecklist(out: Sch["ChecklistOut"]): ChecklistFila[] {
  return REGLAS_CHECKLIST.map(({ regla, etiqueta, negativa }) => {
    const flag = out[regla] === true;
    const ok = negativa ? !flag : flag;
    return { regla, etiqueta, ok, detalle: ok ? "OK" : "No cumple" };
  });
}

export function useChecklist(id: string) {
  return useQuery({
    queryKey: ["checklist", id],
    queryFn: async () => {
      // GET (no POST): validar-politicas es una lectura idempotente en el backend.
      const out = await apiFetch<Sch["ChecklistOut"]>(`/solicitudes/${id}/validar-politicas`);
      return { checklist: aFilasChecklist(out) };
    },
    enabled: Boolean(id),
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
          vars.accion === "desembolsar" ? (vars.idempotencyKey ?? newIdempotencyKey()) : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solicitud", id] }),
  });
}

// ---- Préstamos ----
// El backend acepta ?persona_id / ?estado / ?producto_id / ?vendedor_id (filtros
// en SQL). La ficha 360 del cliente usa `personaId` para traer SOLO sus
// préstamos; `vendedorId` trae la cartera de un vendedor (Mis créditos). Un
// vendedor recibe lo suyo scopeado por el backend aunque no pase vendedor_id.
export function usePrestamos(filtros?: {
  personaId?: string;
  estado?: string;
  vendedorId?: string;
}) {
  const personaId = filtros?.personaId;
  const estado = filtros?.estado;
  const vendedorId = filtros?.vendedorId;
  return useQuery({
    queryKey: ["prestamos", personaId ?? "", estado ?? "", vendedorId ?? ""],
    queryFn: () =>
      apiFetch<Pagina<Sch["PrestamoOut"]>>("/prestamos", {
        query: { persona_id: personaId, estado, vendedor_id: vendedorId },
      }),
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

// ---- Usuarios (admin) ----
// CRUD de usuarios ya existente en el backend (m12_auth). No mueve plata → sin
// Idempotency-Key. UsuarioOut expone roles como string[] (nombres de rol).
export function useUsuarios(page = 1) {
  return useQuery({
    queryKey: ["usuarios", page],
    queryFn: () => apiFetch<Pagina<Sch["UsuarioOut"]>>("/usuarios", { query: { page } }),
  });
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Sch["UsuarioCreate"]) =>
      apiFetch<Sch["UsuarioOut"]>("/usuarios", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });
}

export function useActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Sch["UsuarioUpdate"] }) =>
      apiFetch<Sch["UsuarioOut"]>(`/usuarios/${vars.id}`, { method: "PATCH", body: vars.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });
}

export function useDesactivarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ estado: string }>(`/usuarios/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });
}

// ---- CRM: tareas (tickets), interacciones, timeline ----
// El backend (m08) auto-scopea las tareas al operador para vendedores: un
// vendedor solo ve/edita las suyas (§5.11). No mueven plata → sin Idempotency-Key.

// GET /tareas → Pagina[TareaOut]. ?estado opcional (p. ej. "pendiente").
export function useTareas(filtros?: { estado?: string }) {
  const estado = filtros?.estado;
  return useQuery({
    queryKey: ["tareas", estado ?? ""],
    queryFn: () =>
      apiFetch<Pagina<Sch["TareaOut"]>>("/tareas", { query: { estado } }),
  });
}

// POST /tareas → TareaOut. Si no se manda operador_id, el backend lo fija al actor.
export function useCrearTarea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Sch["TareaIn"]) =>
      apiFetch<Sch["TareaOut"]>("/tareas", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tareas"] }),
  });
}

// POST /tareas/{id}/completar → InteraccionOut. Cierra el ticket y registra la
// interacción (tipo: llamada/visita/mensaje/nota). Invalida tareas y el timeline.
export function useCompletarTarea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { tareaId: string; body: Sch["CompletarTareaIn"] }) =>
      apiFetch<Sch["InteraccionOut"]>(`/tareas/${vars.tareaId}/completar`, {
        method: "POST",
        body: vars.body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      qc.invalidateQueries({ queryKey: ["timeline"] });
    },
  });
}

// POST /interacciones → InteraccionOut. Registra contacto suelto con un cliente
// (sin cerrar tarea). operador_id lo fija siempre el backend al actor.
export function useCrearInteraccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Sch["InteraccionIn"]) =>
      apiFetch<Sch["InteraccionOut"]>("/interacciones", { method: "POST", body }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["timeline", vars.persona_id] }),
  });
}

// GET /personas/{id}/timeline → list[TimelineEvento] (array pelado, sin envelope).
export function useTimelinePersona(personaId: string) {
  return useQuery({
    queryKey: ["timeline", personaId],
    enabled: Boolean(personaId),
    queryFn: () => apiFetch<Sch["TimelineEvento"][]>(`/personas/${personaId}/timeline`),
  });
}
