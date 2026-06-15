import type { Rol } from "./auth";
import type { NavIconName } from "@/components/layout/NavIcon";

/**
 * Arquitectura de información organizada por TRABAJO (verbos), no por entidad.
 * Esta es la fuente ÚNICA de verdad: de acá se derivan el sidebar, los guards
 * de ruta y el ⌘K. La persona NO es un área — es destino de búsqueda/drill-down.
 *
 * Jerarquía: SECCIÓN (grupo del sidebar) → ÁREA (verbo) → TABS (vistas internas).
 */

export type SeccionNav = "operacion" | "control" | "direccion" | "sistema";

export interface NavTab {
  label: string;
  to: string;
}

export interface WorkArea {
  /** id estable */
  id: string;
  /** etiqueta-verbo del sidebar */
  label: string;
  /** ruta principal del área (su primer tab) */
  to: string;
  seccion: SeccionNav;
  /** clave de ícono del set SVG (ver components/layout/NavIcon.tsx) */
  icon: NavIconName;
  roles: Rol[];
  /** vistas internas del área (tabs horizontales). Vacío = área de una sola vista */
  tabs?: NavTab[];
}

export const SECCIONES: Record<SeccionNav, string> = {
  operacion: "Operación",
  control: "Control",
  direccion: "Dirección",
  sistema: "Sistema",
};

export const SECCION_ORDEN: SeccionNav[] = ["operacion", "control", "direccion", "sistema"];

export const WORK_AREAS: WorkArea[] = [
  // ---------- OPERACIÓN ----------
  {
    id: "bandeja",
    label: "Mi bandeja",
    to: "/bandeja",
    seccion: "operacion",
    icon: "inbox",
    roles: ["vendedor", "analista_riesgo", "administrativo", "ceo", "admin_sistema"],
  },
  {
    id: "originar",
    label: "Originar",
    to: "/originar",
    seccion: "operacion",
    icon: "originar",
    roles: ["vendedor"],
    tabs: [
      { label: "Solicitudes", to: "/solicitudes" },
      { label: "Catálogo", to: "/catalogo/productos" },
      { label: "Matrices", to: "/catalogo/matrices" },
      { label: "Simulador", to: "/catalogo/simulador" },
    ],
  },
  {
    id: "evaluar",
    label: "Evaluar",
    to: "/evaluacion",
    seccion: "operacion",
    icon: "evaluar",
    roles: ["analista_riesgo"],
  },
  {
    id: "cobrar",
    label: "Cobrar",
    to: "/ruta",
    seccion: "operacion",
    icon: "cobrar",
    roles: ["administrativo"],
    tabs: [
      { label: "Ruta de Cobranza", to: "/ruta" },
      { label: "Rendición", to: "/rendicion" },
    ],
  },
  {
    id: "cartera",
    label: "Cartera",
    to: "/prestamos",
    seccion: "operacion",
    icon: "cartera",
    roles: ["administrativo"],
    tabs: [
      { label: "Préstamos", to: "/prestamos" },
      { label: "Pagos", to: "/pagos" },
      { label: "Caja", to: "/caja" },
      { label: "Novaciones", to: "/novaciones" },
    ],
  },
  {
    id: "clientes",
    label: "Mis clientes",
    to: "/mis-clientes",
    seccion: "operacion",
    icon: "relacion",
    // Cartera del vendedor: clientes derivados de SUS solicitudes (MisClientesPage).
    // El padrón completo (/personas) queda como drill-down, no como área de menú.
    roles: ["vendedor"],
  },
  {
    id: "relacion",
    label: "Relación",
    to: "/crm/inbox",
    seccion: "operacion",
    icon: "relacion",
    roles: ["vendedor", "administrativo"],
    tabs: [
      { label: "Inbox", to: "/crm/inbox" },
      { label: "Incidentes", to: "/crm/incidentes" },
      { label: "Prospectos", to: "/crm/prospectos" },
      { label: "Asignaciones", to: "/crm/asignaciones" },
    ],
  },

  // ---------- CONTROL ----------
  {
    id: "riesgo",
    label: "Riesgo",
    to: "/riesgo/tablero",
    seccion: "control",
    icon: "riesgo",
    roles: ["analista_riesgo", "ceo"],
    tabs: [
      { label: "Tablero", to: "/riesgo/tablero" },
      { label: "Alertas", to: "/riesgo/alertas" },
    ],
  },
  {
    id: "dinero",
    label: "Dinero",
    to: "/tesoreria",
    seccion: "control",
    icon: "dinero",
    // Sin vendedor: tesorería/análisis/liquidaciones no son del vendedor. Sus
    // comisiones las ve desde su propio home, no desde el área financiera.
    roles: ["administrativo"],
    tabs: [
      { label: "Tesorería", to: "/tesoreria" },
      { label: "Análisis de cartera", to: "/analisis/cartera" },
      { label: "Comisiones", to: "/vendedores/comisiones" },
      { label: "Liquidaciones", to: "/vendedores/liquidaciones" },
    ],
  },

  // ---------- DIRECCIÓN ----------
  {
    id: "tablero-ejecutivo",
    label: "Tablero Ejecutivo",
    to: "/torre",
    seccion: "direccion",
    icon: "tablero",
    roles: ["ceo", "administrativo"],
  },
  {
    // Vistas financieras de solo lectura para el CEO: cash flow (Tesorería) y
    // valor presente/rentabilidad (Análisis de cartera). El backend expone los
    // GET de tesorería a ceo (TesoreriaLectura); las escrituras siguen bloqueadas.
    id: "finanzas",
    label: "Finanzas",
    to: "/tesoreria",
    seccion: "direccion",
    icon: "dinero",
    roles: ["ceo"],
    tabs: [
      { label: "Cash flow", to: "/tesoreria" },
      { label: "Análisis de cartera", to: "/analisis/cartera" },
    ],
  },

  // ---------- SISTEMA ----------
  {
    id: "documentos",
    label: "Documentos",
    to: "/documentos",
    seccion: "sistema",
    icon: "documentos",
    roles: ["administrativo", "analista_riesgo"],
  },
  {
    id: "usuarios",
    label: "Usuarios",
    to: "/usuarios",
    seccion: "sistema",
    icon: "usuarios",
    roles: ["admin_sistema"],
  },
];

function rolPuedeVer(area: WorkArea, roles: Rol[]): boolean {
  return area.roles.length === 0 || area.roles.some((r) => roles.includes(r));
}

/** Áreas visibles para un set de roles. */
export function areasVisibles(roles: Rol[] | undefined): WorkArea[] {
  if (!roles) return [];
  return WORK_AREAS.filter((a) => rolPuedeVer(a, roles));
}

/** Áreas visibles agrupadas por sección (en orden), omitiendo secciones vacías. */
export function areasPorSeccion(
  roles: Rol[] | undefined,
): { seccion: SeccionNav; label: string; areas: WorkArea[] }[] {
  const visibles = areasVisibles(roles);
  return SECCION_ORDEN.map((seccion) => ({
    seccion,
    label: SECCIONES[seccion],
    areas: visibles.filter((a) => a.seccion === seccion),
  })).filter((g) => g.areas.length > 0);
}

/** El área (y tab) que contiene un pathname dado. Fuente única para sidebar
 * activo, AreaTabs y breadcrumb — así nunca divergen. */
export function areaActiva(
  pathname: string,
  roles: Rol[] | undefined,
): { area: WorkArea; tab?: NavTab } | undefined {
  const coincide = (to: string) => pathname === to || pathname.startsWith(to + "/");
  for (const area of areasVisibles(roles)) {
    const tab = (area.tabs ?? []).find((t) => coincide(t.to));
    if (tab) return { area, tab };
    if (coincide(area.to)) return { area };
  }
  return undefined;
}

/** Para el ⌘K modo "Ir a": lista plana de destinos navegables (áreas + tabs).
 * Deduplicado por `to`: un mismo destino puede vivir en dos áreas (p. ej.
 * /analisis/cartera en "Dinero" y en "Finanzas"), pero en ⌘K se lista una vez. */
export function destinosNavegables(roles: Rol[] | undefined): { label: string; to: string }[] {
  const out: { label: string; to: string }[] = [];
  const vistos = new Set<string>();
  const agregar = (label: string, to: string) => {
    if (vistos.has(to)) return;
    vistos.add(to);
    out.push({ label, to });
  };
  for (const area of areasVisibles(roles)) {
    agregar(area.label, area.to);
    for (const tab of area.tabs ?? []) {
      agregar(`${area.label} · ${tab.label}`, tab.to);
    }
  }
  return out;
}
