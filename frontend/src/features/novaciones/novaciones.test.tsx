import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { NovacionesPage } from "./NovacionesPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "/api/v1";

describe("Novaciones", () => {
  it("permite elegir el tipo y ejecutar la novacion mostrando la cadena", async () => {
    renderWithProviders(<NovacionesPage />);
    // cuatro tipos disponibles
    expect(screen.getByRole("button", { name: /refinanciar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /consolidar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /transferir/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /repactar/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /ejecutar/i }));
    // cadena de novación: nuevo préstamo resultante
    expect(await screen.findByText(/prestamo-2/)).toBeInTheDocument();
  });

  it("surfacea el error del backend como alerta en español", async () => {
    server.use(
      http.post(`${BASE}/novaciones/refinanciar`, () =>
        HttpResponse.json(
          { error: { code: "prestamo_no_vigente", message: "El préstamo origen no está vigente" } },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<NovacionesPage />);
    await userEvent.click(screen.getByRole("button", { name: /ejecutar/i }));
    expect(
      await screen.findByText(/El préstamo origen no está vigente/i),
    ).toBeInTheDocument();
  });

  it("usa una Idempotency-Key ESTABLE: el retry tras error reusa la misma; rota tras éxito", async () => {
    const keys: string[] = [];
    let callCount = 0;
    server.use(
      http.post(`${BASE}/novaciones/refinanciar`, ({ request }) => {
        const k = request.headers.get("Idempotency-Key");
        if (k) keys.push(k);
        callCount++;
        if (callCount === 1) {
          // Primer intento: timeout/error simulado.
          return HttpResponse.json(
            { error: { code: "timeout", message: "Error de red simulado" } },
            { status: 500 },
          );
        }
        return HttpResponse.json(
          { id: "nov-1", tipo: "refinanciar", estado: "ejecutada",
            nuevo_prestamo_id: "pr-nuevo", origenes: ["prestamo-1"] },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<NovacionesPage />);
    const ejecutar = () => userEvent.click(screen.getByRole("button", { name: /ejecutar/i }));

    // Intento 1 → error
    await ejecutar();
    await waitFor(() => expect(keys).toHaveLength(1));
    await screen.findByRole("alert");

    // Retry (mismo intento) → MISMA key: no debe generar una segunda novación.
    await ejecutar();
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).toBe(keys[1]);

    // Éxito mostrado → la key se rota para la SIGUIENTE novación.
    await screen.findByText(/pr-nuevo/);
    await ejecutar();
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[1]);
  });
});
