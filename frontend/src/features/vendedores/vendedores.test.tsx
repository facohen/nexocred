import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { ComisionesPage } from "./ComisionesPage";
import { LiquidacionesPage } from "./LiquidacionesPage";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";
const admin = { email: "admin@nexocred.test", nombre: "Admin", roles: ["admin"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...admin, roles: ["admin"] });
});

describe("ComisionesPage", () => {
  it("muestra devengadas/confirmadas/clawbacks/liquidadas con money strings", async () => {
    renderWithProviders(<ComisionesPage vendedorId="user-vendedor" />, { ...admin, roles: ["admin"] });
    expect(await screen.findByTestId("total-devengada")).toHaveTextContent(/5\.000,00/);
    expect(await screen.findByTestId("total-clawback")).toHaveTextContent(/-1\.500,00|1\.500,00/);
    expect((await screen.findAllByText(/clawback/i)).length).toBeGreaterThan(0);
  });

  it("estado de error", async () => {
    server.use(
      http.get(`${BASE}/vendedores/:id/comisiones`, () =>
        HttpResponse.json({ error: { code: "x", message: "falló" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<ComisionesPage vendedorId="user-vendedor" />, { ...admin, roles: ["admin"] });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("LiquidacionesPage", () => {
  it("lista liquidaciones y aprueba (admin)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LiquidacionesPage />, { ...admin, roles: ["admin"] });
    expect(await screen.findByText(/8\.200,00/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Aprobar/i })[0]);
    await waitFor(() => expect(screen.getByText(/aprobada/i)).toBeInTheDocument());
  });

  it("Pagar está deshabilitado para borrador y solo habilitado tras aprobada", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LiquidacionesPage />, { ...admin, roles: ["admin"] });
    await screen.findByText(/8\.200,00/);
    // La liquidación fixture arranca en 'borrador': Pagar debe estar deshabilitado.
    const pagarBorrador = screen.getAllByRole("button", { name: /Pagar/i })[0];
    expect(pagarBorrador).toBeDisabled();
    // Aprobar (gated a borrador) la lleva a 'aprobada' → Pagar se habilita.
    await user.click(screen.getAllByRole("button", { name: /Aprobar/i })[0]);
    await waitFor(() => expect(screen.getByText(/aprobada/i)).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: /Pagar/i })[0]).toBeEnabled();
  });

  it("pagar envía Idempotency-Key", async () => {
    let idemKey: string | null = "MISSING";
    server.use(
      http.post(`${BASE}/comisiones/liquidaciones/:id/pagar`, ({ request, params }) => {
        idemKey = request.headers.get("Idempotency-Key");
        return HttpResponse.json({
          id: params.id, vendedor_id: "user-vendedor", periodo_desde: "2026-05-01",
          periodo_hasta: "2026-05-31", monto_total: "8200.00", estado: "pagada",
          egreso_id: "egreso-1", aprobada_en: "2026-06-01T00:00:00Z",
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LiquidacionesPage />, { ...admin, roles: ["admin"] });
    await screen.findByText(/8\.200,00/);
    // Pagar solo se habilita tras aprobar (estado aprobada).
    await user.click(screen.getAllByRole("button", { name: /Aprobar/i })[0]);
    await waitFor(() => expect(screen.getByText(/aprobada/i)).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: /Pagar/i })[0]);
    await waitFor(() => expect(screen.getByText(/pagada/i)).toBeInTheDocument());
    expect(idemKey).not.toBe("MISSING");
    expect(idemKey).toBeTruthy();
  });
});
