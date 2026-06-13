/**
 * Task 7 — Auditoria de botones transaccionales.
 *
 * Por cada accion critica que mueve dinero/estado, afirmamos que el boton
 * QUEDA DESHABILITADO mientras la mutacion esta en vuelo (handler MSW demorado),
 * de modo que un segundo click no puede re-enviar la operacion. Cada accion usa
 * el `TransactionButton` (disable + spinner) o el patron `isPending` equivalente.
 */
import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { setToken, setSessionUser } from "@/lib/auth";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "/api/v1";

describe("Botones transaccionales: disable durante la mutacion en vuelo", () => {
  beforeEach(() => {
    setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
    setSessionUser({ email: "admin@nexocred.test", nombre: "Admin", roles: ["admin"] });
  });

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

  it("generar liquidacion se deshabilita mientras postea", async () => {
    server.use(
      http.get(`${BASE}/comisiones/liquidaciones`, () => HttpResponse.json([])),
      http.post(`${BASE}/comisiones/liquidaciones`, async () => {
        await delay(200);
        return HttpResponse.json(
          { id: "liq-n", vendedor_id: "user-vendedor", periodo_desde: "2026-06-01",
            periodo_hasta: "2026-06-30", monto_total: "0.00", estado: "borrador" },
          { status: 201 },
        );
      }),
    );
    const { LiquidacionesPage } = await import("./vendedores/LiquidacionesPage");
    renderWithProviders(<LiquidacionesPage />);
    const btn = await screen.findByRole("button", { name: /^generar$/i });
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it("ejecutar novacion se deshabilita mientras postea", async () => {
    server.use(
      http.post(`${BASE}/novaciones/:tipo`, async () => {
        await delay(200);
        return HttpResponse.json(
          { id: "nov-1", tipo: "refinanciar", estado: "ejecutada",
            nuevo_prestamo_id: "pr-nuevo", origenes: ["prestamo-1"] },
          { status: 201 },
        );
      }),
    );
    const { NovacionesPage } = await import("./novaciones/NovacionesPage");
    renderWithProviders(<NovacionesPage />);
    const btn = screen.getByRole("button", { name: /ejecutar novación/i });
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it("presentar rendicion se deshabilita mientras postea", async () => {
    server.use(
      http.get(`${BASE}/rendiciones/:id`, () =>
        HttpResponse.json({
          id: "rendicion-1", ruta_id: "ruta-1", estado: "borrador",
          total_cobrado: "100.00", total_descargos: "0.00", diferencia: "100.00",
          descargos: [],
        }),
      ),
      http.patch(`${BASE}/rendiciones/:id`, async () => {
        await delay(200);
        return HttpResponse.json({
          id: "rendicion-1", ruta_id: "ruta-1", estado: "presentada",
          total_cobrado: "100.00", total_descargos: "0.00", diferencia: "100.00",
        });
      }),
    );
    const { RendicionPage } = await import("./ruta/RendicionPage");
    renderWithProviders(<RendicionPage rendicionId="rendicion-1" />);
    const btn = await screen.findByRole("button", { name: /presentar rendición/i });
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it("ruta sincronizar se deshabilita mientras postea", async () => {
    // La Ruta: con un cobro encolado (pendiente > 0) el boton Sincronizar se
    // habilita; mientras el POST /rutas/:id/sync esta en vuelo queda disabled.
    const { _reset, encolarVisita } = await import("./ruta/queue");
    await _reset();
    await encolarVisita({
      id: "uuidv7-tx-1", rutaId: "ruta-1", paradaId: "p1", prestamoId: "L1",
      orden: 1, resultado: "pago", montoCobrado: "2200.00", pagoId: "uuidv7-pago-tx",
      fotoUrl: null, lat: null, lng: null, notas: null,
      visitadaEn: "2026-06-12T10:00:00Z",
    });
    server.use(
      http.post(`${BASE}/rutas/:id/sync`, async () => {
        await delay(200);
        return HttpResponse.json({ aplicadas: 1, omitidas: 0, rechazadas: 0, detalles: [] });
      }),
    );
    const { RutaPage } = await import("./ruta/RutaPage");
    renderWithProviders(<RutaPage rutaId="ruta-1" />);
    // Seleccionar caja: sin ella construirBatch rechaza (caja_requerida) ANTES
    // del POST y el boton nunca llega a quedar en vuelo.
    await screen.findByRole("option", { name: /caja central/i });
    await userEvent.selectOptions(await screen.findByLabelText(/caja/i), "caja-1");
    const btn = await screen.findByRole("button", { name: /sincronizar/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });
});
