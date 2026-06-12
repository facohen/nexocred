import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionContext, type SesionUsuario } from "@/lib/auth";

const DEFAULT_USER: SesionUsuario = {
  email: "admin@nexocred.test",
  nombre: "Admin",
  roles: ["admin"],
};

export function makeWrapper(user: SesionUsuario = DEFAULT_USER) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <SessionContext.Provider value={{ user, login: () => {}, logout: () => {} }}>
          {children}
        </SessionContext.Provider>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(ui: ReactElement, user?: SesionUsuario) {
  return render(ui, { wrapper: makeWrapper(user) });
}
