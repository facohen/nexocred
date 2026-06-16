import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser, isAuthenticated } from "@/lib/auth";
import { enforceRoles, fallbackRoute, ROUTE_ROLES } from "./guards";
import { LoginPage } from "@/features/auth/LoginPage";

/**
 * Routing inbox-driven con lazy-loading por página. Solo el shell, login y la
 * Ruta de Cobranza (offline, critical path) entran al bundle inicial; el resto
 * se carga bajo demanda → un cobrador no descarga Tesorería. Cada landing por
 * rol es un HOME DE TRABAJO (fallbackRoute), nunca /personas.
 */

// lazy(): carga el componente bajo demanda. La definición de ruta (path/guards)
// queda en el bundle inicial; el componente se trae al navegar.
const lazy = (factory: () => Promise<Record<string, unknown>>, name: string) =>
  lazyRouteComponent(factory as never, name);

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: function Login() {
    return (
      <LoginPage
        onSuccess={() => {
          const user = getSessionUser();
          window.location.href = fallbackRoute(user?.roles ?? []);
        }}
      />
    );
  },
});

// Showcase del design system (solo dev, sin auth).
const designSystemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/ds",
  component: lazy(() => import("@/features/dev/DesignSystemPage"), "DesignSystemPage"),
});

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
  },
  component: function Protected() {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  },
});

function page(path: string, factory: () => Promise<Record<string, unknown>>, exportName: string) {
  const roles = ROUTE_ROLES[path] ?? [];
  return createRoute({
    getParentRoute: () => protectedRoute,
    path,
    // Guard real: enforcea el/los rol(es) de la ruta, no solo visibilidad de nav.
    beforeLoad: () => enforceRoles(roles),
    component: lazy(factory, exportName),
  });
}

// El index redirige al HOME DE TRABAJO del rol (no a /personas hardcodeado).
const indexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/",
  beforeLoad: () => {
    const user = getSessionUser();
    throw redirect({ to: fallbackRoute(user?.roles ?? []) as string });
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  designSystemRoute,
  protectedRoute.addChildren([
    indexRoute,

    // ── Homes de trabajo (inbox-driven) ──
    page("/bandeja", () => import("@/features/bandeja/BandejaHome"), "BandejaHome"),
    page("/evaluacion", () => import("@/features/evaluacion/EvaluacionHome"), "EvaluacionHome"),
    // ── Vendedor: 5 áreas dedicadas ──
    page("/vendedor", () => import("@/features/vendedor/VendedorHome"), "VendedorHome"),
    page("/mis-creditos", () => import("@/features/vendedor/MisCreditosPage"), "MisCreditosPage"),
    page("/gestiones", () => import("@/features/vendedor/GestionesPage"), "GestionesPage"),
    // Originar = SOLO el wizard de carga de un crédito nuevo (sin listado/tabs).
    page("/originar", () => import("@/features/originacion/OriginarWizard"), "OriginarWizard"),

    // ── Entidades y vistas (drill-down / tabs de área) ──
    page("/mis-clientes", () => import("@/features/personas/MisClientesPage"), "MisClientesPage"),
    page("/personas", () => import("@/features/personas/PersonasListPage"), "PersonasListPage"),
    page(
      "/personas/$personaId",
      () => import("@/features/personas/PersonaDetailPage"),
      "PersonaDetailPage",
    ),
    page("/catalogo/productos", () => import("@/features/catalogo/ProductosPage"), "ProductosPage"),
    page("/catalogo/matrices", () => import("@/features/catalogo/MatricesPage"), "MatricesPage"),
    page("/catalogo/simulador", () => import("@/features/catalogo/SimuladorPage"), "SimuladorPage"),
    page("/solicitudes", () => import("@/features/solicitudes/SolicitudesPage"), "SolicitudesPage"),
    page(
      "/solicitudes/$solicitudId",
      () => import("@/features/solicitudes/SolicitudDetailPage"),
      "SolicitudDetailPage",
    ),
    page("/prestamos", () => import("@/features/prestamos/PrestamosPage"), "PrestamosPage"),
    page(
      "/prestamos/$prestamoId",
      () => import("@/features/prestamos/PrestamoDetailPage"),
      "PrestamoDetailPage",
    ),
    page("/pagos", () => import("@/features/pagos/RegistrarPagoPage"), "RegistrarPagoPage"),
    page("/caja", () => import("@/features/caja/CajaPage"), "CajaPage"),
    page("/novaciones", () => import("@/features/novaciones/NovacionesPage"), "NovacionesPage"),

    // La Ruta de Cobranza: NO lazy — es el critical path offline (PWA).
    page("/ruta", () => import("@/features/ruta/RutaRoute"), "RutaRoute"),
    page("/rendicion", () => import("@/features/ruta/RendicionRoute"), "RendicionRoute"),

    page("/crm/inbox", () => import("@/features/crm/InboxPage"), "InboxPage"),
    page("/crm/incidentes", () => import("@/features/crm/IncidentesPage"), "IncidentesPage"),
    page("/crm/asignaciones", () => import("@/features/crm/AsignacionesPage"), "AsignacionesPage"),
    page("/crm/prospectos", () => import("@/features/crm/ProspectosPage"), "ProspectosPage"),
    page("/riesgo/tablero", () => import("@/features/riesgo/RiesgoBoard"), "RiesgoBoard"),
    page("/riesgo/alertas", () => import("@/features/riesgo/AlertasPage"), "AlertasPage"),
    page(
      "/vendedores/comisiones",
      () => import("@/features/vendedores/ComisionesRoute"),
      "ComisionesRoute",
    ),
    page(
      "/vendedores/liquidaciones",
      () => import("@/features/vendedores/LiquidacionesPage"),
      "LiquidacionesPage",
    ),
    page("/tesoreria", () => import("@/features/tesoreria/TesoreriaHome"), "TesoreriaHome"),
    page(
      "/analisis/cartera",
      () => import("@/features/analytics/AnalisisCarteraPage"),
      "AnalisisCarteraPage",
    ),
    page("/torre", () => import("@/features/torre/TorreDashboard"), "TorreDashboard"),
    page("/documentos", () => import("@/features/documentos/DocumentosRoute"), "DocumentosRoute"),
    page("/usuarios", () => import("@/features/admin/UsuariosPage"), "UsuariosPage"),
    page("/maestros", () => import("@/features/maestros/MaestrosPage"), "MaestrosPage"),
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
