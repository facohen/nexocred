import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { SolicitudesPage } from "./SolicitudesPage";
import { SolicitudDetailPage } from "./SolicitudDetailPage";

const params = { solicitudId: "solicitud-2" };
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => params,
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "/api/v1";

describe("Solicitudes", () => {
  it("lista solicitudes de fixtures", async () => {
    renderWithProviders(<SolicitudesPage />);
    expect((await screen.findAllByText(/solicitud-1/)).length).toBeGreaterThan(0);
  });

  it("muestra el checklist de politicas y deshabilita Aprobar cuando BCRA esta vencido", async () => {
    renderWithProviders(<SolicitudDetailPage />);
    // checklist items (etiquetas que arma el frontend desde ChecklistOut)
    expect(await screen.findByText(/Relación cuota\/ingreso/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Situación BCRA/i).length).toBeGreaterThan(0);
    // solicitud-2 tiene bcra:false → fila en falla + Aprobar disabled
    const aprobar = screen.getByRole("button", { name: /aprobar/i });
    await waitFor(() => expect(aprobar).toBeDisabled());
  });

  it("deshabilita Aprobar mientras el checklist está cargando (fail-safe)", async () => {
    server.use(
      http.get(`${BASE}/solicitudes/:id/validar-politicas`, async () => {
        await delay(200);
        return HttpResponse.json({
          edad: true,
          cuota_ingreso: true,
          bcra: true,
          mora_previa: false,
        });
      }),
    );
    renderWithProviders(<SolicitudDetailPage />);
    // antes de que cargue el checklist, Aprobar debe estar deshabilitado
    const aprobar = await screen.findByRole("button", { name: /aprobar/i });
    expect(aprobar).toBeDisabled();
  });

  it("surfacea el error del backend al ejecutar una acción (envelope en español)", async () => {
    server.use(
      http.post(`${BASE}/solicitudes/:id/evaluar`, () =>
        HttpResponse.json(
          {
            error: {
              code: "estado_invalido",
              message: "La solicitud no puede evaluarse en su estado actual",
            },
          },
          { status: 409 },
        ),
      ),
    );
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<SolicitudDetailPage />);
    const evaluar = await screen.findByRole("button", { name: /evaluar/i });
    await userEvent.click(evaluar);
    expect(
      await screen.findByText(/La solicitud no puede evaluarse en su estado actual/i),
    ).toBeInTheDocument();
  });

  it("oculta las acciones (evaluar/simular/aprobar) para el vendedor", async () => {
    renderWithProviders(<SolicitudDetailPage />, {
      email: "vendedor@nexocred.test",
      nombre: "Vendedor",
      roles: ["vendedor"],
    });
    // El checklist (lectura) sí carga para el vendedor.
    expect(await screen.findByText(/Situación BCRA/i)).toBeInTheDocument();
    // Pero ninguna acción está disponible: ve la solicitud en modo lectura.
    expect(screen.queryByRole("button", { name: /evaluar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simular/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aprobar/i })).not.toBeInTheDocument();
  });

  it("trata la regla bcra en falla como bloqueante (fail-safe)", async () => {
    server.use(
      http.get(`${BASE}/solicitudes/:id/validar-politicas`, () =>
        HttpResponse.json({
          edad: true,
          cuota_ingreso: true,
          bcra: false,
          mora_previa: false,
        }),
      ),
    );
    renderWithProviders(<SolicitudDetailPage />);
    const aprobar = await screen.findByRole("button", { name: /aprobar/i });
    await waitFor(() => expect(aprobar).toBeDisabled());
  });
});
