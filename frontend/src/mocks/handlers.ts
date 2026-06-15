import { http, HttpResponse } from "msw";
import * as fx from "./fixtures";

const BASE = "/api/v1";

function err(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

// Copia mutable de usuarios para que el CRUD del mock persista dentro de la sesión
// de tests (las mutaciones se reflejan en el GET). Se siembra del fixture.
let usuariosStore: (typeof fx.usuarios)[number][] = [...fx.usuarios];

export const handlers = [
  // ---- Auth ----
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email ?? "";
    if (!email || !body.password) {
      return err("credenciales_invalidas", "Email o contraseña incorrectos", 401);
    }
    const roles = fx.loginRoles[email];
    if (!roles) {
      return err("credenciales_invalidas", "Email o contraseña incorrectos", 401);
    }
    return HttpResponse.json({
      access_token: fx.makeAccessToken(email, roles),
      refresh_token: `refresh-${email}`,
      token_type: "bearer",
    });
  }),
  http.post(`${BASE}/auth/logout`, () => HttpResponse.json({ ok: true })),
  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({
      access_token: "token-x",
      refresh_token: "refresh-x",
      token_type: "bearer",
    }),
  ),

  // ---- Usuarios ----
  // Store mutable en memoria para que POST/PATCH/DELETE se reflejen en el GET
  // durante los tests. Se siembra desde el fixture en cada arranque del worker.
  http.get(`${BASE}/usuarios`, () =>
    HttpResponse.json({ data: usuariosStore, total: usuariosStore.length, page: 1, per_page: 50 }),
  ),
  http.post(`${BASE}/usuarios`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string;
      nombre?: string;
      roles?: string[];
    };
    if (!body.email || !body.nombre) {
      return err("datos_invalidos", "email y nombre son requeridos", 422);
    }
    const nuevo = {
      id: `user-${usuariosStore.length + 1}`,
      email: body.email,
      nombre: body.nombre,
      roles: body.roles ?? [],
      activo: true,
    };
    usuariosStore = [...usuariosStore, nuevo];
    return HttpResponse.json(nuevo, { status: 201 });
  }),
  http.patch(`${BASE}/usuarios/:id`, async ({ request, params }) => {
    const id = params.id as string;
    const body = (await request.json()) as { nombre?: string; roles?: string[] };
    const actual = usuariosStore.find((u) => u.id === id);
    if (!actual) return err("usuario_inexistente", "usuario no encontrado", 404);
    const actualizado = {
      ...actual,
      nombre: body.nombre ?? actual.nombre,
      roles: body.roles ?? actual.roles,
    };
    usuariosStore = usuariosStore.map((u) => (u.id === id ? actualizado : u));
    return HttpResponse.json(actualizado);
  }),
  http.delete(`${BASE}/usuarios/:id`, ({ params }) => {
    const id = params.id as string;
    const actual = usuariosStore.find((u) => u.id === id);
    if (!actual) return err("usuario_inexistente", "usuario no encontrado", 404);
    usuariosStore = usuariosStore.map((u) => (u.id === id ? { ...u, activo: false } : u));
    return HttpResponse.json({ estado: "desactivado" });
  }),

  // ---- Personas ----
  http.get(`${BASE}/personas`, ({ request }) => {
    const q = new URL(request.url).searchParams.get("q")?.toLowerCase();
    let data = fx.personas;
    if (q) {
      data = data.filter(
        (p) =>
          p.apellido.toLowerCase().includes(q) ||
          p.nombre.toLowerCase().includes(q) ||
          p.dni.includes(q) ||
          p.cuil.includes(q),
      );
    }
    return HttpResponse.json({ data, total: data.length, page: 1, per_page: 50 });
  }),
  http.get(`${BASE}/personas/buscar`, ({ request }) => {
    const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
    const data = fx.personas.filter(
      (p) => p.apellido.toLowerCase().includes(q) || p.dni.includes(q),
    );
    return HttpResponse.json({ data, total: data.length, page: 1, per_page: 50 });
  }),
  http.post(`${BASE}/personas`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.cuil === "27-30111222-5") {
      return err("cuil_duplicado", "Ya existe una persona con ese CUIL", 409);
    }
    const nueva = {
      ...fx.personas[0],
      ...body,
      id: `persona-${fx.personas.length + 1}`,
      activo: true,
      referencias: (body.referencias as fx.Referencia[]) ?? [],
    };
    return HttpResponse.json(nueva, { status: 201 });
  }),
  http.get(`${BASE}/personas/:id`, ({ params }) => {
    const p = fx.personas.find((x) => x.id === params.id);
    if (!p) return err("no_encontrada", "Persona no encontrada", 404);
    return HttpResponse.json(p);
  }),
  http.patch(`${BASE}/personas/:id`, async ({ params, request }) => {
    const p = fx.personas.find((x) => x.id === params.id);
    if (!p) return err("no_encontrada", "Persona no encontrada", 404);
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...p, ...body });
  }),
  http.get(`${BASE}/personas/:id/deuda-bcra`, ({ params }) =>
    HttpResponse.json({ data: fx.deudaBcra[params.id as string] ?? [] }),
  ),
  http.post(`${BASE}/personas/:id/deuda-bcra/sync`, ({ params }) =>
    HttpResponse.json({ data: fx.deudaBcra[params.id as string] ?? [] }),
  ),
  http.get(`${BASE}/bcra/:id/historial`, ({ params }) =>
    HttpResponse.json({ data: fx.deudaBcra[params.id as string] ?? [] }),
  ),
  http.post(`${BASE}/bcra/consultar/:id`, ({ params }) =>
    HttpResponse.json({ data: fx.deudaBcra[params.id as string] ?? [] }),
  ),

  // ---- Productos / matrices / simulador ----
  http.get(`${BASE}/productos`, () =>
    HttpResponse.json({ data: fx.productos, total: fx.productos.length, page: 1, per_page: 50 }),
  ),
  http.get(`${BASE}/productos/:id`, ({ params }) => {
    const p = fx.productos.find((x) => x.id === params.id);
    if (!p) return err("no_encontrado", "Producto no encontrado", 404);
    return HttpResponse.json(p);
  }),
  http.get(`${BASE}/perfiles-pricing`, () => HttpResponse.json({ data: fx.perfilesPricing })),
  http.get(`${BASE}/matrices/tasas`, () =>
    HttpResponse.json({
      data: [
        { producto_id: "producto-1", perfil_pricing_id: "perfil-a", plazo: 12, tasa: "30.00" },
        { producto_id: "producto-1", perfil_pricing_id: "perfil-b", plazo: 12, tasa: "42.00" },
        { producto_id: "producto-1", perfil_pricing_id: "perfil-a", plazo: 24, tasa: "34.00" },
        { producto_id: "producto-1", perfil_pricing_id: "perfil-b", plazo: 24, tasa: "48.00" },
      ],
    }),
  ),
  http.post(`${BASE}/matrices/tasas`, () => HttpResponse.json({ ok: true })),
  http.get(`${BASE}/matrices/comisiones`, () =>
    HttpResponse.json({
      data: [{ producto_id: "producto-1", canal: "directo", comision: "2.00" }],
    }),
  ),
  http.post(`${BASE}/simulador/otorgante`, () => HttpResponse.json(fx.simuladorOut)),
  http.post(`${BASE}/simulador/cotizador`, () => HttpResponse.json(fx.simuladorOut)),
  http.post(`${BASE}/simulador/interno`, () => HttpResponse.json(fx.simuladorOut)),

  // ---- Solicitudes ----
  http.get(`${BASE}/solicitudes`, () =>
    HttpResponse.json({
      data: fx.solicitudes,
      total: fx.solicitudes.length,
      page: 1,
      per_page: 50,
    }),
  ),
  http.post(`${BASE}/solicitudes`, async ({ request }) => {
    const body = (await request.json()) as {
      persona_id: string;
      producto_id: string;
      monto: number | string;
      cantidad_cuotas: number;
      vendedor_id?: string | null;
    };
    return HttpResponse.json(
      {
        id: "sol-nueva",
        persona_id: body.persona_id,
        producto_id: body.producto_id,
        monto: String(body.monto),
        cantidad_cuotas: body.cantidad_cuotas,
        estado: "borrador",
        vendedor_id: body.vendedor_id ?? null,
      },
      { status: 201 },
    );
  }),
  http.get(`${BASE}/solicitudes/:id`, ({ params }) => {
    const s = fx.solicitudes.find((x) => x.id === params.id);
    if (!s) return err("no_encontrada", "Solicitud no encontrada", 404);
    return HttpResponse.json(s);
  }),
  // GET (no POST): refleja el backend real, que devuelve el mapa plano ChecklistOut.
  http.get(`${BASE}/solicitudes/:id/validar-politicas`, ({ params }) =>
    HttpResponse.json(fx.checklistPoliticas[params.id as string] ?? fx.checklistPoliticas.default),
  ),
  http.post(`${BASE}/solicitudes/:id/evaluar`, ({ params }) => {
    const s = fx.solicitudes.find((x) => x.id === params.id);
    return HttpResponse.json({ ...s, estado: "evaluada", score: "705" });
  }),
  http.post(`${BASE}/solicitudes/:id/simular`, () => HttpResponse.json(fx.simuladorOut)),
  http.post(`${BASE}/solicitudes/:id/estado`, async ({ params, request }) => {
    const s = fx.solicitudes.find((x) => x.id === params.id);
    const body = (await request.json()) as { estado?: string };
    return HttpResponse.json({ ...s, estado: body.estado ?? "aprobada" });
  }),
  http.post(`${BASE}/solicitudes/:id/desembolsar`, ({ params }) => {
    const s = fx.solicitudes.find((x) => x.id === params.id);
    return HttpResponse.json({
      ...fx.prestamos[0],
      solicitud_id: params.id,
      persona_id: s?.persona_id,
    });
  }),

  // ---- Préstamos ----
  http.get(`${BASE}/prestamos`, ({ request }) => {
    // El backend filtra por ?persona_id / ?estado en SQL; el mock lo replica para
    // cubrir la ficha 360 del cliente (trae solo SUS préstamos).
    const url = new URL(request.url);
    const personaId = url.searchParams.get("persona_id");
    const estado = url.searchParams.get("estado");
    const data = fx.prestamos.filter(
      (p) => (!personaId || p.persona_id === personaId) && (!estado || p.estado === estado),
    );
    return HttpResponse.json({ data, total: data.length, page: 1, per_page: 50 });
  }),
  http.get(`${BASE}/prestamos/:id`, ({ params }) => {
    const p = fx.prestamos.find((x) => x.id === params.id);
    if (!p) return err("no_encontrado", "Préstamo no encontrado", 404);
    return HttpResponse.json(p);
  }),
  // Array pelado (sin wrapper {data}) — forma real del backend.
  http.get(`${BASE}/prestamos/:id/cuotas`, ({ params }) =>
    HttpResponse.json(fx.cuotas[params.id as string] ?? []),
  ),
  http.get(`${BASE}/prestamos/:id/pagos`, ({ params }) =>
    HttpResponse.json({ data: fx.pagos.filter((p) => p.prestamo_id === params.id) }),
  ),
  http.get(`${BASE}/prestamos/:id/payoff`, ({ params }) => {
    const p = fx.payoff[params.id as string];
    if (!p) return err("no_encontrado", "Préstamo no encontrado", 404);
    return HttpResponse.json(p);
  }),
  http.get(`${BASE}/prestamos/:id/novaciones`, () => HttpResponse.json({ data: fx.novaciones })),

  // ---- Pagos ----
  http.get(`${BASE}/pagos`, () =>
    HttpResponse.json({ data: fx.pagos, total: fx.pagos.length, page: 1, per_page: 50 }),
  ),
  http.post(`${BASE}/pagos`, async ({ request }) => {
    const body = (await request.json()) as { monto?: string; prestamo_id?: string; canal?: string };
    const monto = body.monto ?? "0.00";
    return HttpResponse.json(
      {
        id: `pago-${Date.now()}`,
        prestamo_id: body.prestamo_id ?? "prestamo-1",
        monto,
        excedente: "0.00",
        estado: "aplicado",
        canal: body.canal ?? "efectivo",
        fecha_negocio: "2026-06-11",
        corrige_pago_id: null,
        created_at: new Date().toISOString(),
        imputaciones: [
          {
            id: "i-1",
            concepto: "punitorio_vencido",
            monto: "0.00",
            orden_waterfall: 1,
            cuota_numero: 3,
            cuota_id: "cuota-3",
          },
          {
            id: "i-2",
            concepto: "interes_vencido",
            monto: "12500.00",
            orden_waterfall: 2,
            cuota_numero: 3,
            cuota_id: "cuota-3",
          },
          {
            id: "i-3",
            concepto: "capital_vencido",
            monto: "41666.67",
            orden_waterfall: 3,
            cuota_numero: 3,
            cuota_id: "cuota-3",
          },
        ],
      },
      { status: 201 },
    );
  }),
  http.post(`${BASE}/pagos/a-aplicar`, () => HttpResponse.json(fx.pagos[0].imputaciones)),
  http.get(`${BASE}/pagos/:id`, ({ params }) => {
    const p = fx.pagos.find((x) => x.id === params.id);
    if (!p) return err("no_encontrado", "Pago no encontrado", 404);
    return HttpResponse.json(p);
  }),
  http.post(`${BASE}/pagos/:id/corregir`, ({ params }) =>
    HttpResponse.json({
      pago_original_id: params.id,
      pago_nuevo_id: `pago-new-${params.id}`,
      estado_original: "aplicado",
    }),
  ),

  // ---- Cajas ----
  http.get(`${BASE}/cajas`, () => HttpResponse.json({ data: fx.cajas })),
  http.get(`${BASE}/cajas/posicion-consolidada`, () => HttpResponse.json(fx.posicionConsolidada)),
  http.get(`${BASE}/cajas/:id/movimientos`, ({ params }) =>
    HttpResponse.json({ data: fx.movimientos[params.id as string] ?? [] }),
  ),
  http.post(`${BASE}/transferencias-internas`, () =>
    HttpResponse.json({ ok: true }, { status: 201 }),
  ),

  // ---- Novaciones ----
  http.post(`${BASE}/novaciones/refinanciar`, () =>
    HttpResponse.json(
      { ...fx.novaciones[0], id: "novacion-new", tipo: "refinanciar" },
      { status: 201 },
    ),
  ),
  http.post(`${BASE}/novaciones/consolidar`, () =>
    HttpResponse.json(
      { ...fx.novaciones[0], id: "novacion-new", tipo: "consolidar" },
      { status: 201 },
    ),
  ),
  http.post(`${BASE}/novaciones/transferir`, () =>
    HttpResponse.json(
      { ...fx.novaciones[0], id: "novacion-new", tipo: "transferir" },
      { status: 201 },
    ),
  ),
  http.post(`${BASE}/novaciones/repactar-rapido`, () =>
    HttpResponse.json(
      { ...fx.novaciones[0], id: "novacion-new", tipo: "repactar" },
      { status: 201 },
    ),
  ),
  http.get(`${BASE}/novaciones/:id`, ({ params }) => {
    const n = fx.novaciones.find((x) => x.id === params.id) ?? fx.novaciones[0];
    return HttpResponse.json({ ...n, id: params.id });
  }),

  // ======================= F1c / F1d =======================

  // ---- Rutas / La Ruta ----
  http.get(`${BASE}/rutas`, () =>
    HttpResponse.json({ data: fx.rutas, total: fx.rutas.length, page: 1, per_page: 50 }),
  ),
  http.get(`${BASE}/rutas/:id`, ({ params }) => {
    const r = fx.rutas.find((x) => x.id === params.id);
    if (!r) return err("no_encontrada", "Ruta no encontrada", 404);
    const paradas = (fx.paradas[params.id as string] ?? []).map((p) => {
      const { saldo_exigible: _omit, ...rest } = p as Record<string, unknown>;
      return rest;
    });
    return HttpResponse.json({ ...r, paradas });
  }),
  http.get(`${BASE}/rutas/:id/paradas`, ({ params }) =>
    HttpResponse.json({ data: fx.paradas[params.id as string] ?? [] }),
  ),
  http.post(`${BASE}/rutas/:id/paradas/:paradaId/visitar`, async ({ params, request }) => {
    const body = (await request.json()) as { resultado?: string };
    return HttpResponse.json({
      parada_id: params.paradaId,
      resultado: body.resultado ?? "pago",
      pago_id: body.resultado === "pago" ? `pago-${params.paradaId}` : null,
    });
  }),
  http.post(`${BASE}/rutas/:id/sync`, async ({ params, request }) => {
    const body = (await request.json()) as { paradas: { id: string; resultado?: string }[] };
    // Idempotent reconciliation keyed by device UUIDv7 (parada id). A replayed
    // batch returns "omitida" for already-applied items (no duplicate).
    const items = body.paradas.map((p) => ({
      parada_id: p.id,
      estado: p.resultado ? "aplicada" : "omitida",
      pago_id: p.resultado === "pago" ? `pago-${p.id}` : null,
    }));
    return HttpResponse.json({
      ruta_id: params.id,
      items,
      aplicadas: items.filter((i) => i.estado === "aplicada").length,
      omitidas: items.filter((i) => i.estado === "omitida").length,
      rechazadas: 0,
    });
  }),

  // ---- Rendiciones ----
  http.get(`${BASE}/rendiciones`, () =>
    HttpResponse.json({
      data: fx.rendiciones,
      total: fx.rendiciones.length,
      page: 1,
      per_page: 50,
    }),
  ),
  http.get(`${BASE}/rendiciones/:id`, ({ params }) => {
    const r = fx.rendiciones.find((x) => x.id === params.id);
    if (!r) return err("no_encontrada", "Rendición no encontrada", 404);
    return HttpResponse.json(r);
  }),
  http.post(`${BASE}/rendiciones`, () => HttpResponse.json(fx.rendiciones[0], { status: 201 })),
  http.post(`${BASE}/rendiciones/:id/descargos`, async ({ params, request }) => {
    const body = (await request.json()) as { concepto?: string; monto?: string };
    return HttpResponse.json(
      {
        id: `descargo-${Date.now()}`,
        rendicion_id: params.id,
        concepto: body.concepto ?? "varios",
        monto: body.monto ?? "0.00",
        estado: "pendiente",
        aprobado_por: null,
      },
      { status: 201 },
    );
  }),
  http.patch(`${BASE}/rendiciones/:id`, async ({ params, request }) => {
    const r = fx.rendiciones.find((x) => x.id === params.id) ?? fx.rendiciones[0];
    const body = (await request.json()) as { estado?: string };
    return HttpResponse.json({ ...r, estado: body.estado ?? "presentada" });
  }),

  // ---- CRM ----
  http.get(`${BASE}/tareas`, () =>
    HttpResponse.json({ data: fx.tareas, total: fx.tareas.length, page: 1, per_page: 50 }),
  ),
  http.post(`${BASE}/tareas/:id/completar`, async ({ params, request }) => {
    const body = (await request.json()) as { detalle?: string };
    return HttpResponse.json({
      id: `interaccion-${Date.now()}`,
      persona_id: "persona-1",
      operador_id: "user-operador",
      tipo: "tarea_completada",
      tarea_id: params.id,
      detalle: body.detalle ?? "Tarea completada",
      fecha: new Date().toISOString(),
    });
  }),
  http.post(`${BASE}/interacciones`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: `interaccion-${Date.now()}`, fecha: new Date().toISOString(), tarea_id: null, ...body },
      { status: 201 },
    );
  }),
  http.get(`${BASE}/incidentes`, () =>
    HttpResponse.json({ data: fx.incidentes, total: fx.incidentes.length, page: 1, per_page: 50 }),
  ),
  http.post(`${BASE}/incidentes`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: `incidente-${Date.now()}`, estado: "abierto", ...body },
      { status: 201 },
    );
  }),
  http.patch(`${BASE}/incidentes/:id`, async ({ params, request }) => {
    const i = fx.incidentes.find((x) => x.id === params.id) ?? fx.incidentes[0];
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...i, ...body });
  }),
  http.get(`${BASE}/personas/:id/timeline`, ({ params }) =>
    HttpResponse.json({ data: fx.timeline[params.id as string] ?? [] }),
  ),
  http.get(`${BASE}/personas/:id/tareas`, ({ params }) =>
    HttpResponse.json({ data: fx.tareas.filter((t) => t.persona_id === params.id) }),
  ),
  http.get(`${BASE}/prospectos`, () =>
    HttpResponse.json({ data: fx.prospectos, total: fx.prospectos.length, page: 1, per_page: 50 }),
  ),
  http.post(`${BASE}/prospectos`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: `prospecto-${Date.now()}`, estado: "nuevo", persona_id: null, ...body },
      { status: 201 },
    );
  }),
  http.patch(`${BASE}/prospectos/:id`, async ({ params, request }) => {
    const p = fx.prospectos.find((x) => x.id === params.id) ?? fx.prospectos[0];
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...p, ...body });
  }),
  http.get(`${BASE}/crm/asignaciones`, () => HttpResponse.json({ data: fx.asignaciones })),
  http.post(`${BASE}/crm/asignaciones`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: `asig-${Date.now()}`, activo: true, ...body }, { status: 201 });
  }),
  http.post(`${BASE}/crm/asignaciones/masivo`, async ({ request }) => {
    const body = (await request.json()) as { persona_ids?: string[] };
    return HttpResponse.json({ asignadas: body.persona_ids?.length ?? 0 }, { status: 201 });
  }),

  // ---- Riesgo / Alertas ----
  http.get(`${BASE}/riesgo/tablero`, () => HttpResponse.json(fx.riesgoTablero)),
  http.get(`${BASE}/riesgo/cosechas`, () => HttpResponse.json({ data: fx.cosechas })),
  http.get(`${BASE}/riesgo/concentracion`, () => HttpResponse.json({ data: fx.concentracion })),
  http.get(`${BASE}/alertas`, () =>
    HttpResponse.json({ data: fx.alertas, total: fx.alertas.length, page: 1, per_page: 50 }),
  ),
  http.post(`${BASE}/alertas/:id/resolver`, async ({ params, request }) => {
    const a = fx.alertas.find((x) => x.id === params.id) ?? fx.alertas[0];
    const body = (await request.json()) as { justificacion?: string };
    return HttpResponse.json({
      ...a,
      id: params.id,
      estado: "resuelta",
      resuelta_en: new Date().toISOString(),
      justificacion: body.justificacion ?? null,
    });
  }),
  http.post(`${BASE}/alertas/:id/asignar`, async ({ params, request }) => {
    const a = fx.alertas.find((x) => x.id === params.id) ?? fx.alertas[0];
    const body = (await request.json()) as { operador_id?: string };
    return HttpResponse.json({
      ...a,
      id: params.id,
      operador_id: body.operador_id ?? "user-operador",
      tarea_id: `tarea-${Date.now()}`,
    });
  }),

  // ---- Vendedores / comisiones ----
  http.get(`${BASE}/vendedores/:id/comisiones`, () => HttpResponse.json(fx.comisiones)),
  // Meta del período con avance real (forma MetaVendedorOut). El backend devuelve
  // avance aunque no haya meta fijada; el mock refleja una meta con avance parcial.
  http.get(`${BASE}/vendedores/:id/metas/:periodo`, ({ params }) =>
    HttpResponse.json({ ...fx.metaVendedor, vendedor_id: params.id, periodo: params.periodo }),
  ),
  http.post(`${BASE}/comisiones/clawback`, () =>
    HttpResponse.json({ ...fx.comisiones[2], id: `com-${Date.now()}` }, { status: 201 }),
  ),
  // Forma real del backend: paginado { data, total, page, per_page }.
  http.get(`${BASE}/comisiones/liquidaciones`, () =>
    HttpResponse.json({
      data: fx.liquidaciones,
      total: fx.liquidaciones.length,
      page: 1,
      per_page: 50,
    }),
  ),
  http.get(`${BASE}/comisiones/liquidaciones/:id`, ({ params }) => {
    const l = fx.liquidaciones.find((x) => x.id === params.id);
    if (!l) return err("no_encontrada", "Liquidación no encontrada", 404);
    return HttpResponse.json({
      ...l,
      detalle: [{ id: "ld-1", comision_devengo_id: "com-1", monto: "5000.00" }],
    });
  }),
  http.post(`${BASE}/comisiones/liquidaciones`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { ...fx.liquidaciones[0], id: `liq-${Date.now()}`, ...body },
      { status: 201 },
    );
  }),
  http.post(`${BASE}/comisiones/liquidaciones/:id/aprobar`, ({ params }) =>
    HttpResponse.json({
      ...fx.liquidaciones[0],
      id: params.id,
      estado: "aprobada",
      aprobada_en: new Date().toISOString(),
    }),
  ),
  http.post(`${BASE}/comisiones/liquidaciones/:id/pagar`, ({ params }) =>
    HttpResponse.json({
      ...fx.liquidaciones[0],
      id: params.id,
      estado: "pagada",
      egreso_id: `egreso-${params.id}`,
    }),
  ),

  // ---- Tesorería ----
  http.get(`${BASE}/tesoreria/posicion`, () => HttpResponse.json(fx.tesoreriaPosicion)),
  http.get(`${BASE}/tesoreria/cashflow`, () => HttpResponse.json(fx.tesoreriaCashflow)),
  http.get(`${BASE}/tesoreria/dcf`, () => HttpResponse.json(fx.tesoreriaDcf)),
  http.get(`${BASE}/tesoreria/rotacion`, () => HttpResponse.json(fx.tesoreriaRotacion)),

  // ---- Analytics (rentabilidad) ----
  http.get(`${BASE}/analytics/resumen`, () => HttpResponse.json(fx.analyticsResumen)),
  http.get(`${BASE}/analytics/rentabilidad`, ({ request }) => {
    const dim = new URL(request.url).searchParams.get("dimension") ?? "producto";
    // El mock devuelve el set de producto para cualquier dimensión (suficiente
    // para los tests del dashboard); el contrato real agrega por dimensión.
    const data =
      fx.analyticsRentabilidad[dim as keyof typeof fx.analyticsRentabilidad] ??
      fx.analyticsRentabilidad.producto;
    return HttpResponse.json({ data, total: data.length, page: 1, per_page: 200 });
  }),
  http.post(`${BASE}/tesoreria/aportes`, () => HttpResponse.json({ ok: true }, { status: 201 })),
  http.post(`${BASE}/tesoreria/retiros`, () => HttpResponse.json({ ok: true }, { status: 201 })),

  // ---- La Torre ----
  http.get(`${BASE}/torre/resumen`, ({ request }) => {
    const vacio = new URL(request.url).searchParams.get("vacio");
    return HttpResponse.json(vacio ? fx.torreResumenVacio : fx.torreResumen);
  }),
  http.get(`${BASE}/torre/pulso`, ({ request }) => {
    const vacio = new URL(request.url).searchParams.get("vacio");
    return HttpResponse.json(vacio ? fx.torrePulsoVacio : fx.torrePulso);
  }),
  http.get(`${BASE}/torre/salud-cartera`, () => HttpResponse.json(fx.torreSaludCartera)),
  http.get(`${BASE}/torre/operacion-hoy`, () => HttpResponse.json(fx.torreOperacionHoy)),
  http.get(`${BASE}/torre/negocio`, () => HttpResponse.json(fx.torreNegocio)),
  http.get(`${BASE}/torre/alertas-live`, () => HttpResponse.json(fx.torreAlertasLive)),

  // ---- Documentos ----
  http.get(`${BASE}/prestamos/:id/documentos`, ({ params }) =>
    HttpResponse.json({ data: fx.documentos.filter((d) => d.prestamo_id === params.id) }),
  ),
  http.get(`${BASE}/documentos/:id`, ({ params }) => {
    const d = fx.documentos.find((x) => x.id === params.id);
    if (!d) return err("no_encontrado", "Documento no encontrado", 404);
    return HttpResponse.json(d);
  }),
  http.post(`${BASE}/documentos/generar`, async ({ request }) => {
    const body = (await request.json()) as { prestamo_id?: string; tipo?: string };
    return HttpResponse.json(
      {
        id: `doc-${Date.now()}`,
        prestamo_id: body.prestamo_id ?? "prestamo-1",
        tipo: body.tipo ?? "pagare",
        numero: 1003,
        hash_sha256: "c".repeat(64),
        url_storage: "https://files.test/doc-new.pdf",
        emitido_por: "admin",
        anulado_en: null,
        anulado_por: null,
      },
      { status: 201 },
    );
  }),
  http.get(`${BASE}/documentos/:id/descargar`, ({ params }) =>
    HttpResponse.json({ url: `https://files.test/${params.id}.pdf` }),
  ),
  http.post(`${BASE}/documentos/:id/anular`, async ({ params, request }) => {
    const d = fx.documentos.find((x) => x.id === params.id) ?? fx.documentos[0];
    const body = (await request.json()) as { motivo?: string };
    return HttpResponse.json({
      ...d,
      id: params.id,
      anulado_en: new Date().toISOString(),
      anulado_por: "admin",
      motivo_anulacion: body.motivo ?? null,
    });
  }),
];
