/**
 * Contract-shaped fixtures for F1a/F1b screens. Money fields are ALWAYS
 * strings. These power MSW in dev and tests so the frontend builds and runs
 * with no backend.
 *
 * Los tipos se DERIVAN del schema OpenAPI generado (`components["schemas"]`),
 * no se escriben a mano. Si el backend cambia un contrato, el typecheck de
 * estos fixtures falla en CI — evita el drift que ya causó bugs de runtime.
 */

import type { components } from "@/lib/api/schema";

type S = components["schemas"];

export type Referencia = S["ReferenciaOut"];
export type Persona = S["PersonaOut"];

export const personas: Persona[] = [
  {
    id: "persona-1",
    apellido: "Gómez",
    nombre: "María",
    dni: "30111222",
    cuil: "27-30111222-5",
    fecha_nac: "1985-03-12",
    estado_civil: "casada",
    email: "maria.gomez@example.com",
    telefono: "11-5555-1111",
    domicilio_calle: "Av. Rivadavia",
    domicilio_numero: "1234",
    domicilio_piso: "3 B",
    domicilio_localidad: "CABA",
    domicilio_provincia: "Buenos Aires",
    observaciones_domicilio: null,
    tipo_vivienda: "propia",
    ingresos_declarados: "350000.00",
    ingresos_en_blanco: "280000.00",
    ingresos_totales: "350000.00",
    empleador: "Comercial SA",
    cuit_empleador: "30-12345678-9",
    fecha_ingreso_laboral: "2018-06-01",
    referido_por_id: null,
    activo: true,
    referencias: [
      { id: "ref-1", persona_id: "persona-1", nombre: "Juan Gómez", apellido: "Gómez", vinculo: "conyuge", telefono: "11-5555-2222", es_alternativo: false, notas: null },
    ],
  },
  {
    id: "persona-2",
    apellido: "Pérez",
    nombre: "Carlos",
    dni: "28999888",
    cuil: "20-28999888-9",
    fecha_nac: "1980-11-30",
    estado_civil: "soltero",
    email: "carlos.perez@example.com",
    telefono: "11-4444-3333",
    domicilio_calle: "San Martín",
    domicilio_numero: "500",
    domicilio_piso: null,
    domicilio_localidad: "Lanús",
    domicilio_provincia: "Buenos Aires",
    observaciones_domicilio: null,
    tipo_vivienda: "alquilada",
    ingresos_declarados: "180000.00",
    ingresos_en_blanco: "180000.00",
    ingresos_totales: "180000.00",
    empleador: "Logística SRL",
    cuit_empleador: "30-87654321-0",
    fecha_ingreso_laboral: "2020-01-15",
    referido_por_id: null,
    activo: true,
    referencias: [
      { id: "ref-2", persona_id: "persona-2", nombre: "Ana Pérez", apellido: "Pérez", vinculo: "hermana", telefono: "11-4444-9999", es_alternativo: false, notas: null },
    ],
  },
];

export type DeudaBcra = S["DeudaBcraOut"];

export const deudaBcra: Record<string, DeudaBcra[]> = {
  "persona-1": [
    {
      id: "bcra-1",
      persona_id: "persona-1",
      entidad: "Banco Nación",
      monto: "120000.00",
      situacion: 1,
      fecha_informe: "2026-05-31",
      fuente: "bcra",
    },
  ],
  "persona-2": [
    {
      id: "bcra-2",
      persona_id: "persona-2",
      entidad: "Banco Provincia",
      monto: "450000.00",
      situacion: 4,
      fecha_informe: "2026-04-30",
      fuente: "bcra",
    },
  ],
};

export type Producto = S["ProductoOut"];

export const productos: Producto[] = [
  {
    id: "producto-1",
    nombre: "Préstamo Personal",
    descripcion: "Crédito de consumo en cuotas fijas",
    estado: "publicado",
    version_vigente: 2,
    activo: true,
    periodicidad: "mensual",
    plazos_permitidos: [6, 12, 18, 24],
    monto_minimo: "50000.00",
    monto_maximo: "2000000.00",
    gastos: [
      { id: "gasto-1", producto_id: "producto-1", nombre: "Gasto de otorgamiento", tipo: "porcentaje", valor: "2.50", financiado: true, jurisdiccion: null, activo: true },
      { id: "gasto-2", producto_id: "producto-1", nombre: "Seguro de vida", tipo: "porcentaje", valor: "0.30", financiado: true, jurisdiccion: null, activo: true },
    ],
  },
  {
    id: "producto-2",
    nombre: "Crédito Prendario",
    descripcion: "Garantía prendaria",
    estado: "borrador",
    version_vigente: 1,
    activo: true,
    periodicidad: "mensual",
    plazos_permitidos: [12, 24, 36],
    monto_minimo: "200000.00",
    monto_maximo: "5000000.00",
    gastos: [{ id: "gasto-3", producto_id: "producto-2", nombre: "Gasto de inscripción", tipo: "fijo", valor: "15000.00", financiado: false, jurisdiccion: null, activo: true }],
  },
];

export const perfilesPricing = [
  { id: "perfil-a", nombre: "Perfil A", descripcion: "Bajo riesgo", orden: 1, activo: true },
  { id: "perfil-b", nombre: "Perfil B", descripcion: "Riesgo medio", orden: 2, activo: true },
];

export type FilaCronograma = S["FilaCronogramaOut"];

export function buildCronograma(
  capital: string,
  cuotas: number,
): FilaCronograma[] {
  // Static deterministic figures (strings) — not computed via float.
  const filas: FilaCronograma[] = [];
  const base: Record<number, FilaCronograma> = {};
  for (let n = 1; n <= cuotas; n++) {
    base[n] = {
      numero: n,
      vencimiento: `2026-${String(((n - 1) % 12) + 1).padStart(2, "0")}-10`,
      capital: "8333.33",
      interes: "2500.00",
      cuota: "10833.33",
    };
    filas.push(base[n]);
  }
  void capital;
  return filas;
}

export const simuladorOut = {
  capital: "100000.00",
  tasa_interes_directo: "30.00",
  cantidad_cuotas: 12,
  periodicidad: "mensual",
  total_capital: "100000.00",
  total_interes: "30000.00",
  total_a_pagar: "130000.00",
  cuotas: buildCronograma("100000.00", 12),
};

export type Solicitud = S["SolicitudOut"];

export const solicitudes: Solicitud[] = [
  {
    id: "solicitud-1",
    persona_id: "persona-1",
    producto_id: "producto-1",
    monto: "500000.00",
    cantidad_cuotas: 12,
    estado: "en_evaluacion",
    vendedor_id: "user-vendedor",
    perfil_pricing_id: "perfil-a",
    tasa_resuelta: "30.00",
    score: 720,
    motivo_rechazo: null,
  },
  {
    id: "solicitud-2",
    persona_id: "persona-2",
    producto_id: "producto-1",
    monto: "300000.00",
    cantidad_cuotas: 6,
    estado: "ingresada",
    vendedor_id: "user-vendedor",
    perfil_pricing_id: null,
    tasa_resuelta: null,
    score: null,
    motivo_rechazo: null,
  },
];

// NOTE: hand-written on purpose. The OpenAPI `ChecklistOut` schema is a flat
// boolean record ({edad, cuota_ingreso, bcra, mora_previa}) — a different shape
// than this per-rule row used by the checklist UI. No schema alias applies.
export interface ChecklistPolitica {
  regla: string;
  etiqueta: string;
  ok: boolean;
  detalle: string;
}

export const checklistPoliticas: Record<string, ChecklistPolitica[]> = {
  "solicitud-1": [
    { regla: "edad", etiqueta: "Edad dentro del rango", ok: true, detalle: "41 años" },
    {
      regla: "cuota_ingreso",
      etiqueta: "Relación cuota/ingreso",
      ok: true,
      detalle: "28% (máx 35%)",
    },
    { regla: "bcra", etiqueta: "Situación BCRA", ok: true, detalle: "Situación 1" },
    { regla: "mora", etiqueta: "Sin mora interna", ok: true, detalle: "Sin antecedentes" },
  ],
  "solicitud-2": [
    { regla: "edad", etiqueta: "Edad dentro del rango", ok: true, detalle: "45 años" },
    {
      regla: "cuota_ingreso",
      etiqueta: "Relación cuota/ingreso",
      ok: true,
      detalle: "31% (máx 35%)",
    },
    {
      regla: "bcra",
      etiqueta: "Situación BCRA",
      ok: false,
      detalle: "Situación 4 — vencido",
    },
    { regla: "mora", etiqueta: "Sin mora interna", ok: true, detalle: "Sin antecedentes" },
  ],
};

export type Cuota = S["CuotaOut"];

export type Prestamo = S["PrestamoOut"];

export const prestamos: Prestamo[] = [
  {
    id: "prestamo-1",
    persona_id: "persona-1",
    producto_id: "producto-1",
    solicitud_id: "solicitud-1",
    capital: "500000.00",
    estado: "vigente",
    fecha_desembolso: "2026-01-10",
    tasa_punitorio_diario: "0.10",
    monto_desembolsado: "487500.00",
    snapshot_terminos: {
      tasa_interes_directo: "30.00",
      cantidad_cuotas: 12,
      periodicidad: "mensual",
      gastos: [{ concepto: "Gasto de otorgamiento", valor: "12500.00" }],
    },
    created_at: "2026-01-10T12:00:00Z",
  },
];

// The cuotas endpoint augments CuotaOut with a UI-side `saldo` (see
// `useCuotas` in queries.ts: `CuotaOut & { saldo: string }`). It is not part of
// the OpenAPI schema, so we mirror that same intersection here.
export const cuotas: Record<string, (Cuota & { saldo: string })[]> = {
  "prestamo-1": Array.from({ length: 12 }, (_, i) => ({
    id: `cuota-${i + 1}`,
    numero: i + 1,
    vencimiento: `2026-${String(i + 1).padStart(2, "0")}-10`,
    capital: "41666.67",
    interes: "12500.00",
    cuota: "54166.67",
    punitorio_acumulado: "0.00",
    estado: i < 2 ? "pagada" : "pendiente",
    saldo: i < 2 ? "0.00" : "54166.67",
  })),
};

export type Imputacion = S["ImputacionOut"];

export type Pago = S["PagoDetalleOut"];

export const pagos: Pago[] = [
  {
    id: "pago-1",
    prestamo_id: "prestamo-1",
    monto: "54166.67",
    excedente: "0.00",
    estado: "aplicado",
    canal: "efectivo",
    fecha_negocio: "2026-02-10",
    corrige_pago_id: null,
    created_at: "2026-02-10T10:00:00Z",
    imputaciones: [
      {
        id: "imp-1",
        concepto: "punitorio",
        monto: "0.00",
        orden_waterfall: 1,
        cuota_numero: 1,
        cuota_id: "cuota-1",
      },
      {
        id: "imp-2",
        concepto: "interes",
        monto: "12500.00",
        orden_waterfall: 2,
        cuota_numero: 1,
        cuota_id: "cuota-1",
      },
      {
        id: "imp-3",
        concepto: "capital",
        monto: "41666.67",
        orden_waterfall: 3,
        cuota_numero: 1,
        cuota_id: "cuota-1",
      },
    ],
  },
];

export const payoff: Record<string, { fecha_negocio: string; capital: string; interes: string; punitorio: string; total: string }> = {
  "prestamo-1": {
    fecha_negocio: "2026-06-11",
    capital: "416666.66",
    interes: "12500.00",
    punitorio: "0.00",
    total: "429166.66",
  },
};

export type Caja = S["CajaOut"];

export const cajas: Caja[] = [
  { id: "caja-1", nombre: "Caja Central", tipo: "efectivo", saldo_teorico: "1250000.00", activo: true },
  { id: "caja-2", nombre: "Caja Sucursal Sur", tipo: "efectivo", saldo_teorico: "320000.00", activo: true },
];

export type Movimiento = S["MovimientoOut"];

export const movimientos: Record<string, Movimiento[]> = {
  "caja-1": [
    {
      id: "mov-1",
      caja_id: "caja-1",
      tipo: "ingreso",
      monto: "54166.67",
      fecha_negocio: "2026-02-10",
      concepto: "Cobranza préstamo-1",
      categoria: "cobranza",
      contraparte_caja_id: null,
      pago_id: "pago-1",
      referencia: "pago-1",
      created_at: "2026-02-10T10:00:00Z",
    },
    {
      id: "mov-2",
      caja_id: "caja-1",
      tipo: "egreso",
      monto: "487500.00",
      fecha_negocio: "2026-01-10",
      concepto: "Desembolso préstamo-1",
      categoria: "desembolso",
      contraparte_caja_id: null,
      pago_id: null,
      referencia: "prestamo-1",
      created_at: "2026-01-10T12:00:00Z",
    },
  ],
  "caja-2": [],
};

export const posicionConsolidada = {
  total: "1570000.00",
  // cajas son CajaOut (id, no caja_id) según PosicionConsolidadaOut.
  cajas: cajas,
};

// Aliased to NovacionDetalleOut (= NovacionOut + `origenes`). The fixture backs
// both the list endpoint (NovacionOut) and the detail/POST endpoints
// (NovacionDetalleOut, which the UI reads `origenes` from), so we use the
// superset to satisfy every consumer.
export type Novacion = S["NovacionDetalleOut"];

export const novaciones: Novacion[] = [
  {
    id: "novacion-1",
    tipo: "refinanciar",
    estado: "confirmada",
    nuevo_prestamo_id: "prestamo-2",
    created_at: "2026-05-01T09:00:00Z",
    origenes: ["prestamo-1"],
  },
];

export const usuarios = [
  { id: "user-admin", email: "admin@nexocred.test", nombre: "Admin", roles: ["admin"], activo: true },
  { id: "user-cobrador", email: "cobrador@nexocred.test", nombre: "Cobrador", roles: ["cobrador"], activo: true },
];

/** Map of email → roles for the login mock. */
export const loginRoles: Record<string, string[]> = {
  "admin.full@nexocred.test":     ["admin"],
  "analista.full@nexocred.test":  ["analista"],
  "cobrador_a.full@nexocred.test": ["cobrador"],
  "cobrador_b.full@nexocred.test": ["cobrador"],
  "vendedor.full@nexocred.test":  ["vendedor"],
  "operador.full@nexocred.test":  ["operador"],
  "tesoreria.full@nexocred.test": ["tesoreria"],
};

function base64Url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const b64 =
    typeof btoa === "function"
      ? btoa(json)
      : Buffer.from(json, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build a JWT-shaped access token (header.payload.signature) carrying the
 * user's roles as claims — mirrors how the real backend embeds roles. The
 * signature is a placeholder; the frontend reads claims but never trusts them
 * for security decisions beyond what the backend already authorized.
 */
export function makeAccessToken(email: string, roles: string[]): string {
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const payload = base64Url({ sub: email, roles });
  return `${header}.${payload}.mock-signature`;
}

// ===========================================================================
// F1c / F1d fixtures (operaciones, riesgo, comisiones, tesorería, torre, docs).
// Money fields are ALWAYS strings.
// ===========================================================================

export const rutas = [
  { id: "ruta-1", cobrador_id: "user-cobrador", fecha: "2026-06-12", estado: "abierta" },
  { id: "ruta-2", cobrador_id: "user-cobrador", fecha: "2026-06-11", estado: "cerrada" },
];

export const paradas: Record<string, unknown[]> = {
  "ruta-1": [
    {
      id: "parada-1", ruta_id: "ruta-1", prestamo_id: "prestamo-1", orden: 1,
      resultado: null, monto_cobrado: null, foto_url: null, lat: null, lng: null,
      notas: null, visitada_en: null, saldo_exigible: "12500.00",
    },
    {
      id: "parada-2", ruta_id: "ruta-1", prestamo_id: "prestamo-2", orden: 2,
      resultado: null, monto_cobrado: null, foto_url: null, lat: null, lng: null,
      notas: null, visitada_en: null, saldo_exigible: "8300.50",
    },
  ],
};

export const rendiciones = [
  {
    id: "rendicion-1", ruta_id: "ruta-1", cobrador_id: "user-cobrador",
    fecha_negocio: "2026-06-12", total_cobrado: "20800.50", total_descargos: "1500.00",
    diferencia: "300.00", estado: "borrador",
    descargos: [
      { id: "descargo-1", rendicion_id: "rendicion-1", concepto: "combustible", monto: "1500.00", estado: "aprobado", aprobado_por: "admin" },
    ],
  },
];

export const tareas = [
  { id: "tarea-1", persona_id: "persona-1", operador_id: "user-operador", titulo: "Llamar por mora", descripcion: "Cuota 3 vencida", estado: "pendiente", origen: "alerta", alerta_id: "alerta-1", prioridad: "alta", vencimiento: "2026-06-13" },
  { id: "tarea-2", persona_id: "persona-2", operador_id: "user-operador", titulo: "Seguimiento promesa", descripcion: null, estado: "pendiente", origen: "manual", alerta_id: null, prioridad: "media", vencimiento: null },
];

export const incidentes = [
  { id: "incidente-1", persona_id: "persona-1", tipo: "queja", estado: "abierto", titulo: "Disputa de saldo", severidad: "media", operador_id: "user-operador", detalle: "El cliente discute un punitorio." },
];

export const timeline: Record<string, unknown[]> = {
  "persona-1": [
    { tipo: "interaccion", fecha: "2026-06-10T10:00:00Z", detalle: "Llamada saliente", referencia: "interaccion-1" },
    { tipo: "credito", fecha: "2026-06-01T09:00:00Z", detalle: "Desembolso de préstamo", referencia: "prestamo-1" },
    { tipo: "incidente", fecha: "2026-06-05T12:00:00Z", detalle: "Queja registrada", referencia: "incidente-1" },
    { tipo: "novacion", fecha: "2026-06-08T15:00:00Z", detalle: "Refinanciación", referencia: "novacion-1" },
  ],
};

export const prospectos = [
  { id: "prospecto-1", nombre: "Juan Nuevo", telefono: "11-4444-0000", estado: "nuevo", persona_id: null, operador_id: "user-operador" },
  { id: "prospecto-2", nombre: "Ana Contacto", telefono: "11-4444-0001", estado: "contactado", persona_id: null, operador_id: "user-operador" },
];

export const asignaciones = [
  { id: "asig-1", persona_id: "persona-1", operador_id: "user-operador", activo: true },
];

export const riesgoTablero = {
  par30: "8.50", par60: "4.20", par90: "2.10",
  aging: { "0": "1000000.00", "1-30": "120000.00", "31-60": "60000.00", "61-90": "30000.00", "90+": "15000.00" },
  porcentaje_refinanciado: "6.30", perdida_esperada: "45000.00", cartera_total: "1225000.00",
};

export const cosechas = [
  { mes: "2026-01", capital: "500000.00", mora: "25000.00", ratio_mora: "5.00" },
  { mes: "2026-02", capital: "620000.00", mora: "21700.00", ratio_mora: "3.50" },
  { mes: "2026-03", capital: "710000.00", mora: "35500.00", ratio_mora: "5.00" },
];

export const concentracion = [
  { clave: "Producto A", valor: "700000.00", share: "57.10" },
  { clave: "Producto B", valor: "525000.00", share: "42.90" },
];

export const alertas = [
  { id: "alerta-1", prestamo_id: "prestamo-1", persona_id: "persona-1", tipo: "mora_temprana", estado: "activa", severidad: "alta", metrica: "dias_atraso", valor: "15", operador_id: null, tarea_id: null, resuelta_en: null, justificacion: null },
  { id: "alerta-2", prestamo_id: "prestamo-2", persona_id: "persona-2", tipo: "sobreendeudamiento", estado: "activa", severidad: "media", metrica: "ratio_cuota_ingreso", valor: "0.45", operador_id: null, tarea_id: null, resuelta_en: null, justificacion: null },
];

export const comisiones = [
  { id: "com-1", prestamo_id: "prestamo-1", vendedor_id: "user-vendedor", monto: "5000.00", estado: "devengada", tipo: "alta", porcentaje: "2.00", clawback_de_id: null },
  { id: "com-2", prestamo_id: "prestamo-2", vendedor_id: "user-vendedor", monto: "3200.00", estado: "confirmada", tipo: "alta", porcentaje: "2.00", clawback_de_id: null },
  { id: "com-3", prestamo_id: "prestamo-3", vendedor_id: "user-vendedor", monto: "-1500.00", estado: "clawback", tipo: "clawback", porcentaje: "2.00", clawback_de_id: "com-1" },
  { id: "com-4", prestamo_id: "prestamo-4", vendedor_id: "user-vendedor", monto: "2800.00", estado: "liquidada", tipo: "alta", porcentaje: "2.00", clawback_de_id: null },
];

export const liquidaciones = [
  { id: "liq-1", vendedor_id: "user-vendedor", periodo_desde: "2026-05-01", periodo_hasta: "2026-05-31", monto_total: "8200.00", estado: "borrador", egreso_id: null, aprobada_en: null },
];

export const tesoreriaPosicion = {
  capital_disponible: "3500000.00", capital_colocado: "1225000.00", utilizacion: "25.95", semaforo: "verde",
};
export const tesoreriaCashflow = {
  tramos: [
    { dias: 7, entradas: "120000.00", egresos: "40000.00", neto: "80000.00" },
    { dias: 30, entradas: "480000.00", egresos: "150000.00", neto: "330000.00" },
    { dias: 90, entradas: "1200000.00", egresos: "400000.00", neto: "800000.00" },
  ],
};
export const tesoreriaDcf = {
  flujos_nominales: "1500000.00",
  escenarios: [
    { escenario: "base", tasa_mensual: "3.00", valor_presente: "1180000.00" },
    { escenario: "estresado", tasa_mensual: "4.50", valor_presente: "980000.00" },
  ],
};
export const tesoreriaRotacion = {
  colocacion_periodo: "2400000.00", capital_promedio: "1200000.00", rotacion_anualizada: "2.00",
};

export const torreResumen = {
  tiene_snapshot: true, periodo: "2026-06", indice_nexo: "78.50",
  prestamos_vigentes: 142, prestamos_en_mora: 18,
};
export const torrePulso = {
  tiene_snapshot: true, periodo: "2026-06",
  tarjetas: [
    { clave: "cartera", etiqueta: "Cartera total", valor: "1225000.00" },
    { clave: "par30", etiqueta: "PAR30", valor: "8.50" },
    { clave: "cobranza_hoy", etiqueta: "Cobranza hoy", valor: "20800.50" },
    { clave: "colocacion_mes", etiqueta: "Colocación mes", valor: "2400000.00" },
    { clave: "indice_nexo", etiqueta: "Índice Nexo", valor: "78.50" },
  ],
};
export const torreSaludCartera = {
  tiene_snapshot: true,
  aging: { "0": "1000000.00", "1-30": "120000.00", "31-60": "60000.00", "61-90": "30000.00", "90+": "15000.00" },
  perdida_esperada: "45000.00",
  cosechas, cashflow: tesoreriaCashflow.tramos,
};
export const torreOperacionHoy = {
  cobranza_del_dia: "20800.50", cuotas_vencen_hoy: 12, rutas_activas: 3,
  promesas_pendientes: 5, pipeline_solicitudes: 9,
};
export const torreNegocio = {
  tiene_snapshot: true, colocacion_mes: "2400000.00",
  intereses_cobrados_mes: "180000.00", punitorios_cobrados_mes: "12000.00",
  top_vendedores: [{ nombre: "Vendedor 1", monto: "900000.00" }],
  top_productos: [{ nombre: "Producto A", monto: "1400000.00" }],
};
export const torreAlertasLive = {
  total: 2,
  alertas: [
    { id: "alerta-1", tipo: "mora_temprana", severidad: "alta", metrica: "dias_atraso", valor: "15", prestamo_id: "prestamo-1", persona_id: "persona-1" },
    { id: "alerta-2", tipo: "sobreendeudamiento", severidad: "media", metrica: "ratio_cuota_ingreso", valor: "0.45", prestamo_id: "prestamo-2", persona_id: "persona-2" },
  ],
};

export const torrePulsoVacio = { tiene_snapshot: false, periodo: null, tarjetas: [] };
export const torreResumenVacio = { tiene_snapshot: false, periodo: null, indice_nexo: "0.00", prestamos_vigentes: 0, prestamos_en_mora: 0 };

export const documentos = [
  { id: "doc-1", prestamo_id: "prestamo-1", tipo: "pagare", numero: 1001, hash_sha256: "a".repeat(64), url_storage: "https://files.test/doc-1.pdf", emitido_por: "admin", anulado_en: null, anulado_por: null },
  { id: "doc-2", prestamo_id: "prestamo-1", tipo: "contrato", numero: 1002, hash_sha256: "b".repeat(64), url_storage: "https://files.test/doc-2.pdf", emitido_por: "admin", anulado_en: "2026-06-10T10:00:00Z", anulado_por: "admin" },
];
