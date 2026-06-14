import type { ReactElement, ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/**
 * Selecciona una opción en un EntityCombobox (préstamo, caja, etc.). Abre el
 * popover con `placeholderRegex` (el texto del botón cuando no hay selección),
 * y hace click en la opción cuyo texto matchea `optionRegex`. Necesario desde
 * que PagoForm valida prestamo/caja antes de habilitar el submit.
 */
export async function selectEntity(placeholderRegex: RegExp, optionLabel: string) {
  await userEvent.click(await screen.findByText(placeholderRegex));
  const option = await screen.findByText(optionLabel);
  await userEvent.click(option);
  // El popover cierra y el botón ahora muestra el label seleccionado.
  await waitFor(() => expect(screen.getByText(optionLabel)).toBeInTheDocument());
}
