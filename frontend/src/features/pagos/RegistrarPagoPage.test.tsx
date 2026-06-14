import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders, selectEntity } from "@/test/utils";
import { RegistrarPagoPage } from "./RegistrarPagoPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "/api/v1";

function makePagoResponse(id = "p1") {
  return {
    id,
    prestamo_id: "prestamo-1",
    monto: "100.00",
    excedente: "0.00",
    estado: "aplicado",
    canal: "efectivo",
    fecha_negocio: "2026-06-11",
    corrige_pago_id: null,
    created_at: "x",
    imputaciones: [],
  };
}

describe("RegistrarPagoPage – rotación de idempotency key", () => {
  it("test_key_rota_tras_exito: tras un pago exitoso el segundo submit usa una clave diferente", async () => {
    const keys: string[] = [];

    server.use(
      http.post(`${BASE}/pagos`, async ({ request }) => {
        const k = request.headers.get("Idempotency-Key");
        if (k) keys.push(k);
        return HttpResponse.json(makePagoResponse(), { status: 201 });
      }),
    );

    renderWithProviders(<RegistrarPagoPage />);

    // Préstamo + caja (requeridos para habilitar submit)
    await selectEntity(/buscar préstamo/i, "Préstamo #prestamo-1");
    await selectEntity(/buscar caja/i, "Caja Central");

    // First submit
    await userEvent.type(screen.getByLabelText(/monto/i), "100");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(keys).toHaveLength(1));

    // Second submit (clear monto and retype so we can submit again)
    await userEvent.clear(screen.getByLabelText(/monto/i));
    await userEvent.type(screen.getByLabelText(/monto/i), "200");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(keys).toHaveLength(2));

    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    // After a successful submit, the key MUST be rotated
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("test_key_no_rota_tras_error: tras un error el segundo submit (retry) usa la misma clave", async () => {
    const keys: string[] = [];
    let callCount = 0;

    server.use(
      http.post(`${BASE}/pagos`, async ({ request }) => {
        const k = request.headers.get("Idempotency-Key");
        if (k) keys.push(k);
        callCount++;
        if (callCount === 1) {
          // First call fails
          return HttpResponse.json(
            { error: { code: "pago_fallido", message: "Error de red simulado" } },
            { status: 500 },
          );
        }
        // Second call succeeds
        return HttpResponse.json(makePagoResponse(), { status: 201 });
      }),
    );

    renderWithProviders(<RegistrarPagoPage />);

    await selectEntity(/buscar préstamo/i, "Préstamo #prestamo-1");
    await selectEntity(/buscar caja/i, "Caja Central");

    // First submit → error
    await userEvent.type(screen.getByLabelText(/monto/i), "100");
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(keys).toHaveLength(1));

    // Wait for error to show
    await screen.findByRole("alert");

    // Retry (same monto, same form state)
    await userEvent.click(screen.getByRole("button", { name: /registrar pago/i }));
    await waitFor(() => expect(keys).toHaveLength(2));

    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    // After a failed submit, the key must NOT be rotated (same key for retry)
    expect(keys[0]).toBe(keys[1]);
  });
});
