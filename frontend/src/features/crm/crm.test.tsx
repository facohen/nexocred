import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { InboxPage } from "./InboxPage";
import { IncidentesPage } from "./IncidentesPage";
import { TimelinePanel } from "./TimelinePanel";
import { AsignacionesPage } from "./AsignacionesPage";
import { ProspectosPage } from "./ProspectosPage";
import { setToken, setSessionUser } from "@/lib/auth";

const operador = { email: "operador@nexocred.test", nombre: "Ope", roles: ["administrativo"] as const };
const admin = { email: "admin@nexocred.test", nombre: "Admin", roles: ["administrativo"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...operador, roles: ["administrativo"] });
});

describe("CRM Inbox", () => {
  it("lista las tareas del operador y permite completar (interacción)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InboxPage />, { ...operador, roles: ["administrativo"] });
    expect(await screen.findByText(/Llamar por mora/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Completar/i })[0]);
    await waitFor(() => expect(screen.getByText(/Tarea completada/i)).toBeInTheDocument());
  });
});

describe("CRM Incidentes", () => {
  it("lista incidentes y permite crear uno", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IncidentesPage />, { ...operador, roles: ["administrativo"] });
    expect(await screen.findByText(/Disputa de saldo/i)).toBeInTheDocument();
    await user.type(await screen.findByLabelText(/Título/i), "Nuevo incidente");
    await user.click(screen.getByRole("button", { name: /Crear incidente/i }));
    await waitFor(() => expect(screen.getByText(/Incidente creado/i)).toBeInTheDocument());
  });
});

describe("CRM Timeline 360", () => {
  it("renderiza eventos ordenados (interacciones, crédito, incidente, novación)", async () => {
    renderWithProviders(<TimelinePanel personaId="persona-1" />, { ...operador, roles: ["administrativo"] });
    const items = await screen.findAllByTestId("timeline-evento");
    expect(items.length).toBe(4);
    // ordenado por fecha descendente: el más reciente (2026-06-10) primero
    expect(items[0]).toHaveTextContent(/Llamada saliente/i);
  });
});

describe("CRM Asignaciones (admin)", () => {
  it("permite asignación masiva", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AsignacionesPage />, { ...admin, roles: ["administrativo"] });
    await user.type(await screen.findByLabelText("Operador"), "user-operador");
    await user.type(await screen.findByLabelText(/Personas/i), "persona-1,persona-2");
    await user.click(screen.getByRole("button", { name: /Asignar masivo/i }));
    await waitFor(() => expect(screen.getByText(/2 asignadas/i)).toBeInTheDocument());
  });
});

describe("CRM Prospectos", () => {
  it("lista el pipeline y promueve un prospecto", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProspectosPage />, { ...operador, roles: ["administrativo"] });
    expect(await screen.findByText(/Juan Nuevo/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Promover/i })[0]);
    await waitFor(() => expect(screen.getByText(/promovido/i)).toBeInTheDocument());
  });
});
