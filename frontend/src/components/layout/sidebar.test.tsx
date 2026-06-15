import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// El Sidebar usa useRouterState para resaltar el área activa de forma reactiva.
// En este test unitario de RBAC no hay router montado: devolvemos un pathname fijo.
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/",
}));

import { Sidebar } from "./Sidebar";
import { SessionContext } from "@/lib/auth";
import type { SesionUsuario } from "@/lib/auth";

function renderSidebar(user: SesionUsuario) {
  return render(
    <SessionContext.Provider value={{ user, login: () => {}, logout: () => {} }}>
      <Sidebar />
    </SessionContext.Provider>,
  );
}

describe("Sidebar RBAC", () => {
  it("un administrativo NO ve la nav de sistema (Usuarios)", () => {
    renderSidebar({ email: "c@x", nombre: "Administrativo", roles: ["administrativo"] });
    expect(screen.queryByRole("link", { name: /Usuarios/i })).not.toBeInTheDocument();
    // pero sí ve sus áreas de trabajo: Cobrar y Cartera
    expect(screen.getByRole("link", { name: /Cobrar/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cartera/i })).toBeInTheDocument();
  });

  it("un admin_sistema SÍ ve Usuarios", () => {
    renderSidebar({ email: "a@x", nombre: "Admin", roles: ["admin_sistema"] });
    expect(screen.getByRole("link", { name: /Usuarios/i })).toBeInTheDocument();
  });
});
