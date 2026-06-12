import { screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { SolicitudesPage } from "./SolicitudesPage";
import { SolicitudDetailPage } from "./SolicitudDetailPage";

const params = { solicitudId: "solicitud-2" };
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => params,
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

describe("Solicitudes", () => {
  it("lista solicitudes de fixtures", async () => {
    renderWithProviders(<SolicitudesPage />);
    expect((await screen.findAllByText(/solicitud-1/)).length).toBeGreaterThan(0);
  });

  it("muestra el checklist de politicas y deshabilita Aprobar cuando BCRA esta vencido", async () => {
    renderWithProviders(<SolicitudDetailPage />);
    // checklist items
    expect(await screen.findByText(/Relación cuota\/ingreso/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Situación BCRA/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Situación 4 — vencido/i)).toBeInTheDocument();
    // BCRA flagged → Aprobar disabled
    const aprobar = screen.getByRole("button", { name: /aprobar/i });
    await waitFor(() => expect(aprobar).toBeDisabled());
  });
});
