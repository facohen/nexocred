import { redirect } from "@tanstack/react-router";
import { getSessionUser, hasRole, isAuthenticated, type Rol } from "@/lib/auth";

/**
 * Required role set per route path. Mirrors the nav role sets (nav.ts) so the
 * sidebar visibility and the actual route guard never diverge. An empty array
 * means "any authenticated user".
 */
export const ROUTE_ROLES: Record<string, Rol[]> = {
  // Espeja nav.ts (WORK_AREAS): visibilidad de menú y guard de ruta nunca divergen.
  // Modelo de 5 roles: vendedor / analista_riesgo / administrativo / ceo / admin_sistema.
  // Homes de trabajo (inbox-driven)
  "/bandeja": ["analista_riesgo", "administrativo", "ceo", "admin_sistema"],
  "/evaluacion": ["analista_riesgo"],
  // Vendedor: 5 áreas dedicadas (Inicio/Originar/Mis clientes/Mis créditos/Gestiones).
  "/vendedor": ["vendedor"],
  "/originar": ["vendedor"],
  "/originar/nuevo": ["vendedor"],
  "/mis-creditos": ["vendedor"],
  "/gestiones": ["vendedor"],
  // Entidades y vistas (destino de drill-down / tabs)
  "/mis-clientes": ["vendedor"],
  "/personas": ["vendedor", "analista_riesgo"],
  "/personas/$personaId": ["vendedor", "analista_riesgo"],
  // Catálogo/Matrices: configuración (admin_sistema); Simulador lo usa el vendedor para cotizar.
  "/catalogo/productos": ["admin_sistema"],
  "/catalogo/matrices": ["admin_sistema"],
  "/catalogo/simulador": ["vendedor", "admin_sistema"],
  "/solicitudes": ["vendedor", "analista_riesgo"],
  "/solicitudes/$solicitudId": ["vendedor", "analista_riesgo"],
  "/prestamos": ["administrativo"],
  "/prestamos/$prestamoId": ["administrativo"],
  "/pagos": ["administrativo"],
  "/caja": ["administrativo"],
  "/novaciones": ["vendedor", "analista_riesgo"],
  "/usuarios": ["admin_sistema"],
  // ---- F1c / F1d ----
  "/ruta": ["administrativo"],
  "/rendicion": ["administrativo"],
  "/crm/inbox": ["vendedor", "administrativo"],
  "/crm/incidentes": ["vendedor", "administrativo"],
  "/crm/asignaciones": ["administrativo"],
  "/crm/prospectos": ["vendedor", "administrativo"],
  "/riesgo/tablero": ["analista_riesgo", "ceo"],
  "/riesgo/alertas": ["analista_riesgo", "ceo"],
  "/vendedores/comisiones": ["vendedor", "administrativo"],
  "/vendedores/liquidaciones": ["administrativo"],
  "/tesoreria": ["administrativo", "ceo"],
  "/analisis/cartera": ["ceo", "administrativo"],
  "/torre": ["ceo", "administrativo"],
  "/documentos": ["administrativo", "analista_riesgo"],
};

/**
 * Landing por rol = HOME DE TRABAJO (no entidad). Cada rol aterriza en el estado
 * de su trabajo de hoy, nunca en una tabla de personas.
 */
const ROLE_FALLBACK: [Rol, string][] = [
  ["vendedor", "/vendedor"], // su Inicio: dashboard de performance
  ["analista_riesgo", "/evaluacion"], // su cola de solicitudes a evaluar
  ["administrativo", "/bandeja"], // hub operativo (pagos/rutas/CRM/cartera)
  ["ceo", "/torre"], // Tablero Ejecutivo
  ["admin_sistema", "/usuarios"], // configuración del sistema
];

export function fallbackRoute(roles: Rol[]): string {
  for (const [rol, ruta] of ROLE_FALLBACK) {
    if (roles.includes(rol)) return ruta;
  }
  return "/login";
}

/**
 * Real route guard for use in `beforeLoad`. Enforces authentication and the
 * required role(s) server-of-truth side. Unauthenticated → redirect to /login;
 * authenticated-but-unauthorized → redirect to their role's fallback route
 * (403-equivalent for this SPA). Uses the session roles which come from the
 * JWT, never the email.
 */
export function enforceRoles(roles: Rol[]): void {
  if (!isAuthenticated()) {
    throw redirect({ to: "/login" });
  }
  if (roles.length === 0) return;
  const user = getSessionUser();
  if (!hasRole(user, ...roles)) {
    throw redirect({ to: fallbackRoute(user?.roles ?? []) as string });
  }
}
