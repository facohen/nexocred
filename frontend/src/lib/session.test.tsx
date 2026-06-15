import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionProvider } from "./session";
import { useSession, setToken, setSessionUser, getToken, getSessionUser } from "./auth";

function Probe() {
  const { user, logout } = useSession();
  return (
    <div>
      <span data-testid="user">{user ? user.email : "anon"}</span>
      <button onClick={logout}>Salir</button>
    </div>
  );
}

describe("SessionProvider — logout", () => {
  beforeEach(() => {
    localStorage.clear();
    setToken({
      access_token: "tok",
      refresh_token: "ref",
      token_type: "bearer",
    });
    setSessionUser({ email: "admin@nexocred.test", nombre: "Admin", roles: ["admin_sistema"] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("limpia token, usuario y redirige a /login al salir", async () => {
    // window.location.assign no existe en jsdom como spy-able por defecto.
    const assign = vi.fn();
    vi.stubGlobal("location", { assign, href: "" } as unknown as Location);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    expect(screen.getByTestId("user")).toHaveTextContent("admin@nexocred.test");

    await userEvent.click(screen.getByRole("button", { name: /salir/i }));

    // Sesión local borrada (memoria + localStorage).
    expect(getToken()).toBeNull();
    expect(getSessionUser()).toBeNull();
    // Navegación explícita al login (el bug era que no navegaba).
    expect(assign).toHaveBeenCalledWith("/login");
  });
});
