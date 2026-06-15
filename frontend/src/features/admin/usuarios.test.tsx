import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { UsuariosPage } from "./UsuariosPage";

const BASE = "/api/v1";

describe("UsuariosPage", () => {
  it("lista usuarios con sus roles y estado", async () => {
    renderWithProviders(<UsuariosPage />);
    expect(await screen.findByText("Admin Sistema")).toBeInTheDocument();
    expect(screen.getByText("sistema@nexocred.test")).toBeInTheDocument();
    // rol como badge
    expect(screen.getAllByText("admin_sistema").length).toBeGreaterThanOrEqual(1);
    // estado activo
    expect(screen.getAllByText(/activo/i).length).toBeGreaterThanOrEqual(1);
  });

  it("crea un usuario nuevo desde el modal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosPage />);
    await screen.findByText("Admin Sistema");

    await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));
    const dialog = await screen.findByRole("dialog", { name: /nuevo usuario/i });

    await user.type(within(dialog).getByLabelText(/email/i), "nuevo@nexocred.test");
    await user.type(within(dialog).getByLabelText(/nombre/i), "Nuevo Usuario");
    await user.type(within(dialog).getByLabelText(/contraseña/i), "secreto123");
    await user.click(within(dialog).getByLabelText(/analista/i));
    await user.click(within(dialog).getByRole("button", { name: /crear usuario/i }));

    expect(await screen.findByText("Nuevo Usuario")).toBeInTheDocument();
  });

  it("pide confirmación antes de desactivar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosPage />);
    await screen.findByText("Admin Sistema");

    const desactivar = screen.getAllByRole("button", { name: /desactivar/i });
    await user.click(desactivar[0]);

    const confirm = await screen.findByRole("dialog", { name: /desactivar usuario/i });
    expect(within(confirm).getByText(/no podrá iniciar sesión/i)).toBeInTheDocument();
  });

  it("muestra un error si la carga falla", async () => {
    server.use(
      http.get(`${BASE}/usuarios`, () =>
        HttpResponse.json({ error: { code: "x", message: "boom" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<UsuariosPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);
  });
});
