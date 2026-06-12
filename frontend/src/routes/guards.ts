import { redirect } from "@tanstack/react-router";
import { getSessionUser, hasRole, isAuthenticated, type Rol } from "@/lib/auth";

/**
 * Required role set per route path. Mirrors the nav role sets (nav.ts) so the
 * sidebar visibility and the actual route guard never diverge. An empty array
 * means "any authenticated user".
 */
export const ROUTE_ROLES: Record<string, Rol[]> = {
  "/personas": ["admin", "analista", "vendedor", "operador"],
  "/personas/$personaId": ["admin", "analista", "vendedor", "operador"],
  "/catalogo/productos": ["admin", "analista"],
  "/catalogo/matrices": ["admin", "analista"],
  "/catalogo/simulador": ["admin", "analista", "vendedor"],
  "/solicitudes": ["admin", "analista", "vendedor"],
  "/solicitudes/$solicitudId": ["admin", "analista", "vendedor"],
  "/prestamos": ["admin", "analista", "cobrador", "operador"],
  "/prestamos/$prestamoId": ["admin", "analista", "cobrador", "operador"],
  "/pagos": ["admin", "cobrador", "operador", "tesoreria"],
  "/caja": ["admin", "tesoreria", "operador"],
  "/novaciones": ["admin", "analista"],
  "/usuarios": ["admin"],
  // ---- F1c / F1d ----
  "/ruta": ["cobrador", "admin"],
  "/rendicion": ["cobrador", "admin"],
  "/crm/inbox": ["operador", "admin"],
  "/crm/incidentes": ["operador", "admin"],
  "/crm/asignaciones": ["admin"],
  "/crm/prospectos": ["operador", "admin"],
  "/riesgo/tablero": ["admin", "analista"],
  "/riesgo/alertas": ["admin", "analista", "operador"],
  "/vendedores/comisiones": ["admin", "vendedor"],
  "/vendedores/liquidaciones": ["admin", "tesoreria"],
  "/tesoreria": ["admin", "tesoreria"],
  "/torre": ["admin", "tesoreria"],
  "/documentos": ["admin", "analista", "operador"],
};

/**
 * Real route guard for use in `beforeLoad`. Enforces authentication and the
 * required role(s) server-of-truth side. Unauthenticated → redirect to /login;
 * authenticated-but-unauthorized → redirect to /personas (403-equivalent for
 * this SPA). Uses the session roles which come from the JWT, never the email.
 */
export function enforceRoles(roles: Rol[]): void {
  if (!isAuthenticated()) {
    throw redirect({ to: "/login" });
  }
  if (roles.length === 0) return;
  const user = getSessionUser();
  if (!hasRole(user, ...roles)) {
    throw redirect({ to: "/personas" as string });
  }
}
