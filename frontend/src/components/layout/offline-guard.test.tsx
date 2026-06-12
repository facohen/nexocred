/**
 * Decisión de negocio #3 — guard de conectividad de mostrador.
 *
 * OFFLINE en una pantalla de MOSTRADOR (no-Ruta): la acción financiera
 * (TransactionButton) queda DESHABILITADA y aparece el banner "Esperando
 * conexión". OFFLINE en La Ruta (/ruta): NO hay banner y la acción sigue
 * habilitada (su flujo offline con cola es intencional).
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  createMemoryHistory,
} from "@tanstack/react-router";
import { AppShell } from "./AppShell";
import { TransactionButton } from "@/components/TransactionButton";
import { SessionContext, type SesionUsuario } from "@/lib/auth";

const USER: SesionUsuario = { email: "op@nexo.test", nombre: "Op", roles: ["admin"] };

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function MostradorPantalla() {
  return <TransactionButton>Registrar pago</TransactionButton>;
}
function RutaPantalla() {
  return <TransactionButton>Sincronizar</TransactionButton>;
}

function montarEn(pathname: string) {
  const root = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });
  const pagos = createRoute({ getParentRoute: () => root, path: "/pagos", component: MostradorPantalla });
  const ruta = createRoute({ getParentRoute: () => root, path: "/ruta", component: RutaPantalla });
  const router = createRouter({
    routeTree: root.addChildren([pagos, ruta]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={{ user: USER, login: () => {}, logout: () => {} }}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("Guard de conectividad de mostrador (decisión #3)", () => {
  beforeEach(() => setOnline(true));
  afterEach(() => setOnline(true));

  it("OFFLINE en mostrador: deshabilita la acción y muestra el banner", async () => {
    setOnline(false);
    montarEn("/pagos");
    expect(await screen.findByTestId("banner-offline")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /registrar pago/i })).toBeDisabled(),
    );
  });

  it("ONLINE en mostrador: sin banner y la acción habilitada", async () => {
    setOnline(true);
    montarEn("/pagos");
    const btn = await screen.findByRole("button", { name: /registrar pago/i });
    expect(btn).not.toBeDisabled();
    expect(screen.queryByTestId("banner-offline")).not.toBeInTheDocument();
  });

  it("OFFLINE en La Ruta: SIN banner y la acción sigue habilitada (exenta)", async () => {
    setOnline(false);
    montarEn("/ruta");
    const btn = await screen.findByRole("button", { name: /sincronizar/i });
    expect(btn).not.toBeDisabled();
    expect(screen.queryByTestId("banner-offline")).not.toBeInTheDocument();
  });
});
