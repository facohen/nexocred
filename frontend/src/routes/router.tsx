import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { isAuthenticated } from "@/lib/auth";
import { LoginPage } from "@/features/auth/LoginPage";
import { PersonasListPage } from "@/features/personas/PersonasListPage";
import { PersonaDetailPage } from "@/features/personas/PersonaDetailPage";
import { ProductosPage } from "@/features/catalogo/ProductosPage";
import { MatricesPage } from "@/features/catalogo/MatricesPage";
import { SimuladorPage } from "@/features/catalogo/SimuladorPage";
import { SolicitudesPage } from "@/features/solicitudes/SolicitudesPage";
import { SolicitudDetailPage } from "@/features/solicitudes/SolicitudDetailPage";
import { PrestamosPage } from "@/features/prestamos/PrestamosPage";
import { PrestamoDetailPage } from "@/features/prestamos/PrestamoDetailPage";
import { RegistrarPagoPage } from "@/features/pagos/RegistrarPagoPage";
import { CajaPage } from "@/features/caja/CajaPage";
import { NovacionesPage } from "@/features/novaciones/NovacionesPage";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: function Login() {
    return <LoginPage onSuccess={() => (window.location.href = "/personas")} />;
  },
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

function page(path: string, component: () => JSX.Element) {
  return createRoute({ getParentRoute: () => protectedRoute, path, component });
}

const indexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/personas" as string });
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  protectedRoute.addChildren([
    indexRoute,
    page("/personas", PersonasListPage),
    page("/personas/$personaId", PersonaDetailPage),
    page("/catalogo/productos", ProductosPage),
    page("/catalogo/matrices", MatricesPage),
    page("/catalogo/simulador", SimuladorPage),
    page("/solicitudes", SolicitudesPage),
    page("/solicitudes/$solicitudId", SolicitudDetailPage),
    page("/prestamos", PrestamosPage),
    page("/prestamos/$prestamoId", PrestamoDetailPage),
    page("/pagos", RegistrarPagoPage),
    page("/caja", CajaPage),
    page("/novaciones", NovacionesPage),
    page("/usuarios", function Usuarios() {
      return <div className="text-sm">Gestión de usuarios (admin).</div>;
    }),
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
