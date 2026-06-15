import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { RendicionPage } from "./RendicionPage";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";
const cobrador = { email: "cobrador@nexocred.test", nombre: "Cobra", roles: ["administrativo"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...cobrador, roles: ["administrativo"] });
});

describe("RendicionPage", () => {
  it("muestra total cobrado, descargos y diferencia con MoneyText", async () => {
    renderWithProviders(<RendicionPage rendicionId="rendicion-1" />, { ...cobrador, roles: ["administrativo"] });
    expect(await screen.findByText(/20\.800,50/)).toBeInTheDocument(); // total cobrado
    expect(await screen.findByText(/combustible/i)).toBeInTheDocument();
    expect(await screen.findByText(/300,00/)).toBeInTheDocument(); // diferencia
  });

  it("permite agregar un descargo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RendicionPage rendicionId="rendicion-1" />, { ...cobrador, roles: ["administrativo"] });
    await screen.findByText(/combustible/i);
    await user.type(await screen.findByLabelText(/Concepto/i), "viáticos");
    await user.type(await screen.findByLabelText(/Monto/i), "500.00");
    await user.click(screen.getByRole("button", { name: /Agregar descargo/i }));
    await waitFor(() => expect(screen.getByText(/Descargo registrado/i)).toBeInTheDocument());
  });

  it("ejecuta la acción presentar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RendicionPage rendicionId="rendicion-1" />, { ...cobrador, roles: ["administrativo"] });
    await screen.findByText(/combustible/i);
    await user.click(screen.getByRole("button", { name: /Presentar rendición/i }));
    await waitFor(() => expect(screen.getByText(/presentada/i)).toBeInTheDocument());
  });

  it("surfacea el error del backend", async () => {
    server.use(
      http.get(`${BASE}/rendiciones/:id`, () =>
        HttpResponse.json({ error: { code: "no_encontrada", message: "Rendición no encontrada" } }, { status: 404 }),
      ),
    );
    renderWithProviders(<RendicionPage rendicionId="rendicion-x" />, { ...cobrador, roles: ["administrativo"] });
    expect(await screen.findByRole("alert")).toHaveTextContent(/no encontrada/i);
  });
});
