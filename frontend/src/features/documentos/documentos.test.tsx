import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { DocumentosPage } from "./DocumentosPage";
import { setToken, setSessionUser } from "@/lib/auth";

const BASE = "/api/v1";
const admin = { email: "admin@nexocred.test", nombre: "Admin", roles: ["admin"] as const };

beforeEach(() => {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ ...admin, roles: ["admin"] });
});

describe("DocumentosPage", () => {
  it("lista documentos con número y hash; marca anulados", async () => {
    renderWithProviders(<DocumentosPage prestamoId="prestamo-1" />, { ...admin, roles: ["admin"] });
    expect(await screen.findByText(/1001/)).toBeInTheDocument();
    expect(await screen.findByText(/aaaaaaaa/i)).toBeInTheDocument(); // hash truncado
    expect(await screen.findByText(/anulado/i)).toBeInTheDocument(); // doc-2 anulado
  });

  it("generar envía Idempotency-Key", async () => {
    let idemKey: string | null = "MISSING";
    server.use(
      http.post(`${BASE}/documentos/generar`, ({ request }) => {
        idemKey = request.headers.get("Idempotency-Key");
        return HttpResponse.json(
          {
            id: "doc-new", prestamo_id: "prestamo-1", tipo: "pagare", numero: 1003,
            hash_sha256: "c".repeat(64), url_storage: "https://x/d.pdf",
            emitido_por: "admin", anulado_en: null, anulado_por: null,
          },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentosPage prestamoId="prestamo-1" />, { ...admin, roles: ["admin"] });
    await screen.findByText(/1001/);
    await user.click(screen.getByRole("button", { name: /Generar documento/i }));
    await waitFor(() => expect(screen.getByText(/Documento generado/i)).toBeInTheDocument());
    expect(idemKey).not.toBe("MISSING");
    expect(idemKey).toBeTruthy();
  });

  it("anular pide motivo y marca el documento", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentosPage prestamoId="prestamo-1" />, { ...admin, roles: ["admin"] });
    await screen.findByText(/1001/);
    await user.click(screen.getAllByRole("button", { name: /Anular/i })[0]);
    await user.type(await screen.findByLabelText(/Motivo/i), "error de carga");
    await user.click(screen.getByRole("button", { name: /Confirmar anulación/i }));
    await waitFor(() => expect(screen.getByText(/Documento anulado/i)).toBeInTheDocument());
  });

  it("estado de error", async () => {
    server.use(
      http.get(`${BASE}/prestamos/:id/documentos`, () =>
        HttpResponse.json({ error: { code: "x", message: "falló" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<DocumentosPage prestamoId="prestamo-1" />, { ...admin, roles: ["admin"] });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
