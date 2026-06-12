import type { Rol } from "./auth";

export interface NavItem {
  label: string;
  to: string;
  /** Roles allowed to see this item. Empty = everyone authenticated. */
  roles: Rol[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Personas", to: "/personas", roles: ["admin", "analista", "vendedor", "operador"] },
  { label: "Catálogo", to: "/catalogo/productos", roles: ["admin", "analista"] },
  { label: "Simulador", to: "/catalogo/simulador", roles: ["admin", "analista", "vendedor"] },
  { label: "Solicitudes", to: "/solicitudes", roles: ["admin", "analista", "vendedor"] },
  { label: "Préstamos", to: "/prestamos", roles: ["admin", "analista", "cobrador", "operador"] },
  { label: "Pagos", to: "/pagos", roles: ["admin", "cobrador", "operador", "tesoreria"] },
  { label: "Caja", to: "/caja", roles: ["admin", "tesoreria", "operador"] },
  { label: "Novaciones", to: "/novaciones", roles: ["admin", "analista"] },
  { label: "La Ruta", to: "/ruta", roles: ["cobrador", "admin"] },
  { label: "Rendición", to: "/rendicion", roles: ["cobrador", "admin"] },
  { label: "CRM", to: "/crm/inbox", roles: ["operador", "admin"] },
  { label: "Riesgo", to: "/riesgo/tablero", roles: ["admin", "analista"] },
  { label: "Alertas", to: "/riesgo/alertas", roles: ["admin", "analista", "operador"] },
  { label: "Comisiones", to: "/vendedores/comisiones", roles: ["admin", "vendedor"] },
  { label: "Liquidaciones", to: "/vendedores/liquidaciones", roles: ["admin", "tesoreria"] },
  { label: "Tesorería", to: "/tesoreria", roles: ["admin", "tesoreria"] },
  { label: "La Torre", to: "/torre", roles: ["admin", "tesoreria"] },
  { label: "Documentos", to: "/documentos", roles: ["admin", "analista", "operador"] },
  { label: "Usuarios", to: "/usuarios", roles: ["admin"] },
];

export function visibleNav(roles: Rol[] | undefined): NavItem[] {
  if (!roles) return [];
  return NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || item.roles.some((r) => roles.includes(r)),
  );
}
