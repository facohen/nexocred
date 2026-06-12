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
  { label: "Usuarios", to: "/usuarios", roles: ["admin"] },
];

export function visibleNav(roles: Rol[] | undefined): NavItem[] {
  if (!roles) return [];
  return NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || item.roles.some((r) => roles.includes(r)),
  );
}
