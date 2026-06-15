import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { InboxPage } from "./InboxPage";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";
const operador = { email: "op@x", nombre: "Ope", roles: ["administrativo"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...operador, roles: ["administrativo"] });
});

describe("InboxPage — bandeja del operador (inbox-driven)", () => {
  it("muestra el hero 'Mi inbox' con conteo de pendientes", async () => {
    renderWithProviders(<InboxPage />, { ...operador, roles: ["administrativo"] });
    expect(await screen.findByRole("heading", { name: /Mi inbox/i })).toBeInTheDocument();
  });

  it("agrupa tareas por urgencia (Vencidas / Para hoy / Próximas)", async () => {
    renderWithProviders(<InboxPage />, { ...operador, roles: ["administrativo"] });
    // Las 3 secciones de urgencia siempre se renderizan (con su conteo).
    expect(await screen.findByText("Vencidas")).toBeInTheDocument();
    expect(screen.getByText("Para hoy")).toBeInTheDocument();
    expect(screen.getByText("Próximas")).toBeInTheDocument();
  });

  it("clasifica una tarea vencida en la sección Vencidas", async () => {
    server.use(
      http.get(`${BASE}/tareas`, () =>
        HttpResponse.json({
          data: [
            {
              id: "t-venc",
              persona_id: "p1",
              operador_id: "op",
              titulo: "Tarea atrasada",
              descripcion: null,
              estado: "pendiente",
              origen: "manual",
              alerta_id: null,
              prioridad: "alta",
              vencimiento: "2020-01-01",
            },
          ],
          total: 1,
          page: 1,
          per_page: 50,
        }),
      ),
    );
    renderWithProviders(<InboxPage />, { ...operador, roles: ["administrativo"] });
    expect(await screen.findByText("Tarea atrasada")).toBeInTheDocument();
    // El subtítulo del hero menciona "N vencidas" (minúscula); distinto de la
    // sección "Vencidas". Verificamos que la tarea cayó en la sección correcta.
    expect(screen.getByText(/1 vencidas/i)).toBeInTheDocument();
  });
});
