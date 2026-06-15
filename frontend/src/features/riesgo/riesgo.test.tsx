import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { RiesgoBoard } from "./RiesgoBoard";
import { AlertasPage } from "./AlertasPage";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";
const admin = { email: "admin@nexocred.test", nombre: "Admin", roles: ["analista_riesgo"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...admin, roles: ["analista_riesgo"] });
});

describe("RiesgoBoard", () => {
  it("renderiza PAR y cartera total desde el mock (money strings)", async () => {
    renderWithProviders(<RiesgoBoard />, { ...admin, roles: ["analista_riesgo"] });
    expect(await screen.findByText(/8,50\s*%/)).toBeInTheDocument(); // PAR30
    expect(await screen.findByText(/1\.225\.000,00/)).toBeInTheDocument(); // cartera total
    // cosechas presentes (al menos los meses)
    expect(await screen.findByText(/concentración/i)).toBeInTheDocument();
  });

  it("muestra estado de carga y luego datos", async () => {
    renderWithProviders(<RiesgoBoard />, { ...admin, roles: ["analista_riesgo"] });
    expect(screen.getByTestId("riesgo-loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("riesgo-loading")).not.toBeInTheDocument());
  });

  it("muestra estado de error", async () => {
    server.use(
      http.get(`${BASE}/riesgo/tablero`, () =>
        HttpResponse.json({ error: { code: "x", message: "falló" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<RiesgoBoard />, { ...admin, roles: ["analista_riesgo"] });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("AlertasPage", () => {
  it("lista alertas activas y resuelve con justificación", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AlertasPage />, { ...admin, roles: ["analista_riesgo"] });
    expect(await screen.findByText(/mora_temprana/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Resolver/i })[0]);
    await user.type(await screen.findByLabelText(/Justificación/i), "Regularizado");
    await user.click(screen.getByRole("button", { name: /Confirmar resolución/i }));
    await waitFor(() => expect(screen.getByText(/Alerta resuelta/i)).toBeInTheDocument());
  });

  it("asigna una alerta (crea tarea)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AlertasPage />, { ...admin, roles: ["analista_riesgo"] });
    await screen.findByText(/mora_temprana/i);
    await user.click(screen.getAllByRole("button", { name: /Asignar/i })[0]);
    await waitFor(() => expect(screen.getByText(/Tarea creada/i)).toBeInTheDocument());
  });

  it("estado vacío cuando no hay alertas", async () => {
    server.use(
      http.get(`${BASE}/alertas`, () =>
        HttpResponse.json({ data: [], total: 0, page: 1, per_page: 50 }),
      ),
    );
    renderWithProviders(<AlertasPage />, { ...admin, roles: ["analista_riesgo"] });
    expect(await screen.findByText(/No hay alertas activas/i)).toBeInTheDocument();
  });
});
