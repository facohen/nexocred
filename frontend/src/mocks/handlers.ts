import { http, HttpResponse } from "msw";
import * as fx from "./fixtures";

const BASE = "http://localhost/api/v1";

function err(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

export const handlers = [
  // ---- Auth ----
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email ?? "";
    if (!email || !body.password) {
      return err("credenciales_invalidas", "Email o contraseña incorrectos", 401);
    }
    if (!fx.loginRoles[email]) {
      return err("credenciales_invalidas", "Email o contraseña incorrectos", 401);
    }
    return HttpResponse.json({
      access_token: `token-${email}`,
      refresh_token: `refresh-${email}`,
      token_type: "bearer",
    });
  }),
  http.post(`${BASE}/auth/logout`, () => HttpResponse.json({ ok: true })),
  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({ access_token: "token-x", refresh_token: "refresh-x", token_type: "bearer" }),
  ),

  // ---- Usuarios ----
  http.get(`${BASE}/usuarios`, () => HttpResponse.json({ data: fx.usuarios, total: fx.usuarios.length, page: 1, per_page: 50 })),

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
    if (body.cuil === "27-30111222-4") {
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
    HttpResponse.json({ data: [{ producto_id: "producto-1", canal: "directo", comision: "2.00" }] }),
  ),
  http.post(`${BASE}/simulador/otorgante`, () => HttpResponse.json(fx.simuladorOut)),
  http.post(`${BASE}/simulador/cotizador`, () => HttpResponse.json(fx.simuladorOut)),
  http.post(`${BASE}/simulador/interno`, () => HttpResponse.json(fx.simuladorOut)),

  // ---- Solicitudes ----
  http.get(`${BASE}/solicitudes`, () =>
    HttpResponse.json({ data: fx.solicitudes, total: fx.solicitudes.length, page: 1, per_page: 50 }),
  ),
  http.get(`${BASE}/solicitudes/:id`, ({ params }) => {
    const s = fx.solicitudes.find((x) => x.id === params.id);
    if (!s) return err("no_encontrada", "Solicitud no encontrada", 404);
    return HttpResponse.json(s);
  }),
  http.post(`${BASE}/solicitudes/:id/validar-politicas`, ({ params }) =>
    HttpResponse.json({ checklist: fx.checklistPoliticas[params.id as string] ?? [] }),
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
    return HttpResponse.json({ ...fx.prestamos[0], solicitud_id: params.id, persona_id: s?.persona_id });
  }),

  // ---- Préstamos ----
  http.get(`${BASE}/prestamos`, () =>
    HttpResponse.json({ data: fx.prestamos, total: fx.prestamos.length, page: 1, per_page: 50 }),
  ),
  http.get(`${BASE}/prestamos/:id`, ({ params }) => {
    const p = fx.prestamos.find((x) => x.id === params.id);
    if (!p) return err("no_encontrado", "Préstamo no encontrado", 404);
    return HttpResponse.json(p);
  }),
  http.get(`${BASE}/prestamos/:id/cuotas`, ({ params }) =>
    HttpResponse.json({ data: fx.cuotas[params.id as string] ?? [] }),
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
  http.get(`${BASE}/pagos`, () => HttpResponse.json({ data: fx.pagos, total: fx.pagos.length, page: 1, per_page: 50 })),
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
          { id: "i-1", concepto: "punitorio", monto: "0.00", orden_waterfall: 1, cuota_numero: 3, cuota_id: "cuota-3" },
          { id: "i-2", concepto: "interes", monto: "12500.00", orden_waterfall: 2, cuota_numero: 3, cuota_id: "cuota-3" },
          { id: "i-3", concepto: "capital", monto: "41666.67", orden_waterfall: 3, cuota_numero: 3, cuota_id: "cuota-3" },
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
      contra_asiento: {
        id: `pago-rev-${params.id}`,
        prestamo_id: "prestamo-1",
        monto: "-54166.67",
        estado: "reversado",
        corrige_pago_id: params.id,
        imputaciones: [],
      },
      reemplazo: {
        id: `pago-new-${params.id}`,
        prestamo_id: "prestamo-1",
        monto: "54166.67",
        estado: "aplicado",
        corrige_pago_id: null,
        imputaciones: [],
      },
    }),
  ),

  // ---- Cajas ----
  http.get(`${BASE}/cajas`, () => HttpResponse.json({ data: fx.cajas })),
  http.get(`${BASE}/cajas/posicion-consolidada`, () => HttpResponse.json(fx.posicionConsolidada)),
  http.get(`${BASE}/cajas/:id/movimientos`, ({ params }) =>
    HttpResponse.json({ data: fx.movimientos[params.id as string] ?? [] }),
  ),
  http.post(`${BASE}/transferencias-internas`, () => HttpResponse.json({ ok: true }, { status: 201 })),

  // ---- Novaciones ----
  http.post(`${BASE}/novaciones/refinanciar`, () =>
    HttpResponse.json({ ...fx.novaciones[0], id: "novacion-new", tipo: "refinanciar" }, { status: 201 }),
  ),
  http.post(`${BASE}/novaciones/consolidar`, () =>
    HttpResponse.json({ ...fx.novaciones[0], id: "novacion-new", tipo: "consolidar" }, { status: 201 }),
  ),
  http.post(`${BASE}/novaciones/transferir`, () =>
    HttpResponse.json({ ...fx.novaciones[0], id: "novacion-new", tipo: "transferir" }, { status: 201 }),
  ),
  http.post(`${BASE}/novaciones/repactar-rapido`, () =>
    HttpResponse.json({ ...fx.novaciones[0], id: "novacion-new", tipo: "repactar" }, { status: 201 }),
  ),
  http.get(`${BASE}/novaciones/:id`, ({ params }) => {
    const n = fx.novaciones.find((x) => x.id === params.id) ?? fx.novaciones[0];
    return HttpResponse.json({ ...n, id: params.id });
  }),
];
