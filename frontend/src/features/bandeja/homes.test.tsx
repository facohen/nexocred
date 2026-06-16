import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

// Los homes usan useNavigate; sin RouterProvider en el test, lo mockeamos.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
import { BandejaHome } from "./BandejaHome";
import { EvaluacionHome } from "@/features/evaluacion/EvaluacionHome";
import { setToken, setSessionUser } from "@/lib/auth";

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
});

describe("Homes de trabajo (inbox-driven)", () => {
  it("BandejaHome muestra el hub 'Mi bandeja' según el rol", () => {
    const admin = { email: "a@x", nombre: "Admin", roles: ["administrativo"] as const };
    setSessionUser({ ...admin, roles: ["administrativo"] });
    renderWithProviders(<BandejaHome />, { ...admin, roles: ["administrativo"] });
    expect(screen.getByText(/Mi bandeja/i)).toBeInTheDocument();
  });

  it("EvaluacionHome (analista) muestra la cola de evaluación", async () => {
    const analista = { email: "an@x", nombre: "Analista", roles: ["analista_riesgo"] as const };
    setSessionUser({ ...analista, roles: ["analista_riesgo"] });
    renderWithProviders(<EvaluacionHome />, { ...analista, roles: ["analista_riesgo"] });
    // El home del analista integra el mini-tablero de riesgo (PAR30 + cola).
    expect(await screen.findByText(/PAR30/i)).toBeInTheDocument();
    expect(await screen.findByText(/cola de riesgo/i)).toBeInTheDocument();
  });
});
