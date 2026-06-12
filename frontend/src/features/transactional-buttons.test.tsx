/**
 * Task 7 — Auditoria de botones transaccionales.
 *
 * Por cada accion critica que mueve dinero/estado, afirmamos que el boton
 * QUEDA DESHABILITADO mientras la mutacion esta en vuelo (handler MSW demorado),
 * de modo que un segundo click no puede re-enviar la operacion. Cada accion usa
 * el `TransactionButton` (disable + spinner) o el patron `isPending` equivalente.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "http://localhost/api/v1";

describe("Botones transaccionales: disable durante la mutacion en vuelo", () => {
  it("registrar pago se deshabilita mientras postea", async () => {
    server.use(
      http.post(`${BASE}/pagos`, async () => {
        await delay(200);
        return HttpResponse.json(
          { id: "p1", prestamo_id: "prestamo-1", monto: "100.00", excedente: "0.00",
            estado: "aplicado", canal: "efectivo", fecha_negocio: "2026-06-01",
            corrige_pago_id: null, created_at: "x", imputaciones: [] },
          { status: 201 },
        );
      }),
    );
    const { RegistrarPagoPage } = await import("./pagos/RegistrarPagoPage");
    renderWithProviders(<RegistrarPagoPage />);
    await userEvent.type(screen.getByLabelText(/monto/i), "100");
    const btn = screen.getByRole("button", { name: /registrar pago/i });
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it("corregir pago se deshabilita mientras postea", async () => {
    server.use(
      http.post(`${BASE}/pagos/:id/corregir`, async ({ params }) => {
        await delay(200);
        return HttpResponse.json({
          pago_original_id: params.id, pago_nuevo_id: "pn", estado_original: "aplicado",
        });
      }),
    );
    const { CorreccionDialog } = await import("./pagos/CorreccionDialog");
    renderWithProviders(
      <CorreccionDialog pagoId="pago-1" open onOpenChange={() => {}} />,
    );
    const btn = screen.getByRole("button", { name: /corregir/i });
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it("desembolsar (aprobar y desembolsar) se deshabilita mientras postea", async () => {
    server.use(
      // Checklist limpio (todas las politicas OK, BCRA OK) -> Aprobar habilitado.
      http.post(`${BASE}/solicitudes/:id/validar-politicas`, () =>
        HttpResponse.json({
          checklist: [
            { regla: "bcra", ok: true, detalle: "Situación 1" },
            { regla: "cuota_ingreso", ok: true, detalle: "OK" },
          ],
        }),
      ),
      http.post(`${BASE}/solicitudes/:id/desembolsar`, async () => {
        await delay(200);
        return HttpResponse.json({ prestamo_id: "pr1", estado: "desembolsada",
          cantidad_cuotas: 6 }, { status: 201 });
      }),
    );
    const { SolicitudDetailPage } = await import("./solicitudes/SolicitudDetailPage");
    renderWithProviders(<SolicitudDetailPage />);
    const btn = await screen.findByRole("button", { name: /aprobar y desembolsar/i });
    // Habilitado solo cuando el checklist esta listo y BCRA ok (fixtures).
    await waitFor(() => expect(btn).not.toBeDisabled());
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it("generar documento se deshabilita mientras postea", async () => {
    server.use(
      http.post(`${BASE}/documentos/generar`, async () => {
        await delay(200);
        return HttpResponse.json(
          { id: "d1", prestamo_id: "prestamo-1", tipo: "pagare", numero: 1,
            hash_sha256: "abc", url_storage: null, emitido_por: "u1",
            anulado_en: null, anulado_por: null },
          { status: 201 },
        );
      }),
    );
    const { DocumentosPage } = await import("./documentos/DocumentosPage");
    renderWithProviders(<DocumentosPage prestamoId="prestamo-1" />);
    const btn = await screen.findByRole("button", { name: /generar documento/i });
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it("liquidacion pagar se deshabilita mientras postea", async () => {
    server.use(
      http.get(`${BASE}/comisiones/liquidaciones`, () =>
        HttpResponse.json([
          { id: "liq-1", vendedor_id: "user-vendedor", periodo_desde: "2026-05-01",
            periodo_hasta: "2026-06-01", monto_total: "2000.00", estado: "aprobada" },
        ]),
      ),
      http.post(`${BASE}/comisiones/liquidaciones/:id/pagar`, async () => {
        await delay(200);
        return HttpResponse.json({ id: "liq-1", vendedor_id: "user-vendedor",
          periodo_desde: "2026-05-01", periodo_hasta: "2026-06-01",
          monto_total: "2000.00", estado: "pagada" });
      }),
    );
    const { LiquidacionesPage } = await import("./vendedores/LiquidacionesPage");
    renderWithProviders(<LiquidacionesPage />);
    const btn = await screen.findByRole("button", { name: /^pagar$/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });
});
