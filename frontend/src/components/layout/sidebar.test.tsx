import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
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
  it("un cobrador NO ve la nav admin (Usuarios)", () => {
    renderSidebar({ email: "c@x", nombre: "Cobrador", roles: ["cobrador"] });
    expect(screen.queryByRole("link", { name: /Usuarios/i })).not.toBeInTheDocument();
    // pero sí ve Pagos / Caja
    expect(screen.getByRole("link", { name: /Pagos/i })).toBeInTheDocument();
  });

  it("un admin SÍ ve Usuarios", () => {
    renderSidebar({ email: "a@x", nombre: "Admin", roles: ["admin"] });
    expect(screen.getByRole("link", { name: /Usuarios/i })).toBeInTheDocument();
  });
});
