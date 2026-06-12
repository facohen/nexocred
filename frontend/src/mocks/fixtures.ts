/**
 * Contract-shaped fixtures for F1a/F1b screens. Money fields are ALWAYS
 * strings. These power MSW in dev and tests so the frontend builds and runs
 * with no backend.
 */

export interface Referencia {
  id: string;
  nombre: string;
  vinculo: string;
  telefono: string;
}

export interface Persona {
  id: string;
  apellido: string;
  nombre: string;
  dni: string;
  cuil: string;
  fecha_nac: string;
  estado_civil: string;
  email: string;
  telefono: string;
  domicilio_calle: string;
  domicilio_numero: string | null;
  domicilio_piso: string | null;
  domicilio_localidad: string;
  domicilio_provincia: string;
  observaciones_domicilio: string | null;
  tipo_vivienda: string;
  ingresos_declarados: string;
  ingresos_en_blanco: string;
  ingresos_totales: string;
  empleador: string | null;
  cuit_empleador: string | null;
  fecha_ingreso_laboral: string | null;
  referido_por_id: string | null;
  activo: boolean;
  referencias: Referencia[];
}

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
      { id: "ref-1", nombre: "Juan Gómez", vinculo: "conyuge", telefono: "11-5555-2222" },
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
      { id: "ref-2", nombre: "Ana Pérez", vinculo: "hermana", telefono: "11-4444-9999" },
    ],
  },
];

export interface DeudaBcra {
  id: string;
  persona_id: string;
  entidad: string;
  monto: string;
  situacion: number;
  fecha_informe: string;
  fuente: string;
}

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

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: string;
  version_vigente: number;
  activo: boolean;
  periodicidad: string | null;
  plazos_permitidos: number[];
  monto_minimo: string | null;
  monto_maximo: string | null;
  gastos: { nombre: string; tipo: string; valor: string }[];
}

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
      { nombre: "Gasto de otorgamiento", tipo: "porcentaje", valor: "2.50" },
      { nombre: "Seguro de vida", tipo: "porcentaje", valor: "0.30" },
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
    gastos: [{ nombre: "Gasto de inscripción", tipo: "fijo", valor: "15000.00" }],
  },
];

export const perfilesPricing = [
  { id: "perfil-a", nombre: "Perfil A", descripcion: "Bajo riesgo", orden: 1, activo: true },
  { id: "perfil-b", nombre: "Perfil B", descripcion: "Riesgo medio", orden: 2, activo: true },
];

export interface FilaCronograma {
  numero: number;
  vencimiento: string;
  capital: string;
  interes: string;
  cuota: string;
}

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

export interface Solicitud {
  id: string;
  persona_id: string;
  producto_id: string;
  monto: string;
  cantidad_cuotas: number;
  estado: string;
  vendedor_id: string | null;
  perfil_pricing_id: string | null;
  tasa_resuelta: string | null;
  score: string | null;
  motivo_rechazo: string | null;
}

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
    score: "720",
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

export interface Cuota {
  id: string;
  numero: number;
  vencimiento: string;
  capital: string;
  interes: string;
  cuota: string;
  punitorio_acumulado: string;
  estado: string;
  saldo: string;
}

export interface Prestamo {
  id: string;
  persona_id: string;
  producto_id: string;
  solicitud_id: string | null;
  capital: string;
  estado: string;
  fecha_desembolso: string | null;
  tasa_punitorio_diario: string;
  monto_desembolsado: string | null;
  snapshot_terminos: Record<string, unknown> | null;
  created_at: string;
}

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

export const cuotas: Record<string, Cuota[]> = {
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

export interface Imputacion {
  id: string;
  concepto: string;
  monto: string;
  orden_waterfall: number;
  cuota_numero: number | null;
  cuota_id: string | null;
}

export interface Pago {
  id: string;
  prestamo_id: string;
  monto: string;
  excedente: string;
  estado: string;
  canal: string | null;
  fecha_negocio: string | null;
  corrige_pago_id: string | null;
  created_at: string;
  imputaciones: Imputacion[];
}

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

export interface Caja {
  id: string;
  nombre: string;
  tipo: string | null;
  saldo_teorico: string;
  activo: boolean;
}

export const cajas: Caja[] = [
  { id: "caja-1", nombre: "Caja Central", tipo: "efectivo", saldo_teorico: "1250000.00", activo: true },
  { id: "caja-2", nombre: "Caja Sucursal Sur", tipo: "efectivo", saldo_teorico: "320000.00", activo: true },
];

export interface Movimiento {
  id: string;
  caja_id: string;
  tipo: string;
  monto: string;
  fecha_negocio: string;
  concepto: string;
  categoria: string;
  contraparte_caja_id: string | null;
  pago_id: string | null;
  referencia: string | null;
  created_at: string;
}

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
  cajas: [
    { caja_id: "caja-1", nombre: "Caja Central", saldo_teorico: "1250000.00" },
    { caja_id: "caja-2", nombre: "Caja Sucursal Sur", saldo_teorico: "320000.00" },
  ],
};

export interface Novacion {
  id: string;
  tipo: string;
  estado: string;
  nuevo_prestamo_id: string | null;
  created_at: string;
  origenes: string[];
}

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
  "admin@nexocred.test": ["admin"],
  "analista@nexocred.test": ["analista"],
  "cobrador@nexocred.test": ["cobrador"],
  "vendedor@nexocred.test": ["vendedor"],
  "operador@nexocred.test": ["operador"],
  "tesoreria@nexocred.test": ["tesoreria"],
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
