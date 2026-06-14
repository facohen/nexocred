import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders, selectEntity } from "@/test/utils";
import { RegistrarPagoPage } from "./RegistrarPagoPage";
import { CorreccionDialog } from "./CorreccionDialog";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "/api/v1";

describe("RegistrarPago", () => {
  it("postea el pago y muestra el waterfall de imputaciones con money strings", async () => {
    renderWithProviders(<RegistrarPagoPage />);
    // PagoForm exige préstamo + caja seleccionados (y monto) para habilitar submit.
    await selectEntity(/buscar préstamo/i, "Préstamo #prestamo-1");
    await selectEntity(/buscar caja/i, "Caja Central");
    await userEvent.type(screen.getByLabelText(/monto/i), "54166.67");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));

    expect(await screen.findByText(/imputaci/i)).toBeInTheDocument();
    // waterfall: capital imputado
    expect(screen.getByText("$ 41.666,67")).toHaveClass("tabular-nums");
  });

  it("envia el header Idempotency-Key al registrar el pago", async () => {
    let seenKey: string | null = null;
    server.use(
      http.post(`${BASE}/pagos`, async ({ request }) => {
        seenKey = request.headers.get("Idempotency-Key");
        return HttpResponse.json(
          { id: "p9", prestamo_id: "prestamo-1", monto: "100.00", excedente: "0.00", estado: "aplicado", canal: "efectivo", fecha_negocio: "2026-06-11", corrige_pago_id: null, created_at: "x", imputaciones: [] },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<RegistrarPagoPage />);
    await selectEntity(/buscar préstamo/i, "Préstamo #prestamo-1");
    await selectEntity(/buscar caja/i, "Caja Central");
    await userEvent.type(screen.getByLabelText(/monto/i), "100");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(seenKey).toBeTruthy());
    // El key debe ser un valor generado por cliente (UUID crypto o fallback idem-*),
    // NO un placeholder vacio ni un literal fijo: una regresion que mande "" o un
    // string constante debe HACER FALLAR este test.
    expect(seenKey).toMatch(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|idem-.+)$/i,
    );
  });
});

describe("CorreccionDialog", () => {
  it("muestra la corrección con la forma real f1b (pago original→nuevo y estado original)", async () => {
    server.use(
      http.post(`${BASE}/pagos/:id/corregir`, ({ params }) =>
        HttpResponse.json({
          pago_original_id: params.id,
          pago_nuevo_id: "pago-nuevo-9",
          estado_original: "aplicado",
        }),
      ),
    );
    renderWithProviders(<CorreccionDialog pagoId="pago-1" open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /corregir/i }));
    // pago original id
    expect(await screen.findByText(/pago-1/)).toBeInTheDocument();
    // pago nuevo id
    expect(screen.getByText(/pago-nuevo-9/)).toBeInTheDocument();
    // estado original
    expect(screen.getByText(/aplicado/i)).toBeInTheDocument();
  });
});
