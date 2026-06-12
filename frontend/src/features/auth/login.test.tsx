import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { LoginPage } from "./LoginPage";
import { SessionProvider } from "@/lib/session";
import { clearToken, getToken } from "@/lib/auth";

const BASE = "http://localhost/api/v1";

function renderLogin(onSuccess = vi.fn()) {
  return render(
    <SessionProvider>
      <LoginPage onSuccess={onSuccess} />
    </SessionProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => clearToken());

  it("guarda el token y navega al ingresar credenciales validas", async () => {
    const onSuccess = vi.fn();
    renderLogin(onSuccess);
    await userEvent.type(screen.getByLabelText(/email/i), "admin@nexocred.test");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /ingresar/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(getToken()?.access_token).toBeTruthy();
  });

  it("muestra el error en español del sobre cuando las credenciales son invalidas", async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: "credenciales_invalidas", message: "Email o contraseña incorrectos" } },
          { status: 401 },
        ),
      ),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email/i), "x@y.com");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "bad");
    await userEvent.click(screen.getByRole("button", { name: /ingresar/i }));
    expect(await screen.findByText(/Email o contraseña incorrectos/i)).toBeInTheDocument();
  });
});
