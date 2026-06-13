import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { SessionContext } from "@/lib/auth";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

function renderPalette() {
  return render(
    <SessionContext.Provider
      value={{
        user: { email: "a@x", nombre: "Admin", roles: ["admin"] },
        login: () => {},
        logout: () => {},
      }}
    >
      <CommandPalette open onOpenChange={() => {}} />
    </SessionContext.Provider>,
  );
}

describe("CommandPalette", () => {
  it("lista áreas de trabajo y acciones cuando está abierta (sin query)", () => {
    renderPalette();
    // Áreas de trabajo (verbos), no entidades de base de datos
    expect(screen.getByText("Mi bandeja")).toBeInTheDocument();
    expect(screen.getByText("Tablero Ejecutivo")).toBeInTheDocument();
    expect(screen.getByText("Usuarios")).toBeInTheDocument();
    // Acción rápida global (también accesible por botón visible)
    expect(screen.getByText("Registrar pago")).toBeInTheDocument();
  });
});
