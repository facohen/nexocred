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
  it("lista destinos navegables cuando esta abierta", () => {
    renderPalette();
    expect(screen.getByText("Personas")).toBeInTheDocument();
    expect(screen.getByText("Caja")).toBeInTheDocument();
    expect(screen.getByText("Usuarios")).toBeInTheDocument();
  });
});
