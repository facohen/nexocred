import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { RegistrarPagoPage } from "./RegistrarPagoPage";
import { CorreccionDialog } from "./CorreccionDialog";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "http://localhost/api/v1";

describe("RegistrarPago", () => {
  it("postea el pago y muestra el waterfall de imputaciones con money strings", async () => {
    renderWithProviders(<RegistrarPagoPage />);
    await userEvent.type(screen.getByLabelText(/monto/i), "54166.67");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));

    expect(await screen.findByText(/imputaciones/i)).toBeInTheDocument();
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
    await userEvent.type(screen.getByLabelText(/monto/i), "100");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(seenKey).toBeTruthy());
  });
});

describe("CorreccionDialog", () => {
  it("reversa un pago y muestra contra-asiento + reemplazo", async () => {
    renderWithProviders(<CorreccionDialog pagoId="pago-1" open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /corregir/i }));
    expect(await screen.findByRole("heading", { name: /contra-asiento/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /reemplazo/i })).toBeInTheDocument();
  });
});
