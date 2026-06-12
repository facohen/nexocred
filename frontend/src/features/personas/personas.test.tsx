import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { PersonasListPage } from "./PersonasListPage";
import { PersonaForm } from "./PersonaForm";
import { PersonaDetailPage } from "./PersonaDetailPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ personaId: "persona-2" }),
  Link: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a>,
}));

const BASE = "http://localhost/api/v1";

describe("Personas list", () => {
  it("renderiza filas de fixtures y filtra por busqueda", async () => {
    renderWithProviders(<PersonasListPage />);
    expect(await screen.findByText("Gómez")).toBeInTheDocument();
    expect(screen.getByText("Pérez")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/buscar/i), "Gómez");
    await waitFor(() => expect(screen.queryByText("Pérez")).not.toBeInTheDocument());
    expect(screen.getByText("Gómez")).toBeInTheDocument();
  });
});

describe("PersonaForm validacion", () => {
  it("bloquea el submit si falta ingresos_totales y muestra error en español", async () => {
    const onCreated = vi.fn();
    renderWithProviders(<PersonaForm onCreated={onCreated} />);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByText(/ingresos totales/i)).toBeInTheDocument();
  });

  it("surfacea el error del backend cuil_duplicado en español", async () => {
    server.use(
      http.post(`${BASE}/personas`, () =>
        HttpResponse.json(
          { error: { code: "cuil_duplicado", message: "Ya existe una persona con ese CUIL" } },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<PersonaForm onCreated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/apellido/i), "Gómez");
    await userEvent.type(screen.getByLabelText(/^nombre/i), "María");
    await userEvent.type(screen.getByLabelText(/dni/i), "30111222");
    await userEvent.type(screen.getByLabelText(/cuil/i), "27-30111222-4");
    await userEvent.type(screen.getByLabelText(/email/i), "m@x.com");
    await userEvent.type(screen.getByLabelText(/ingresos totales/i), "350000");
    await userEvent.type(screen.getByLabelText(/referencia.*nombre/i), "Juan");
    await userEvent.type(screen.getByLabelText(/referencia.*teléfono/i), "11-5555-2222");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByText(/Ya existe una persona con ese CUIL/i)).toBeInTheDocument();
  });
});

describe("PersonaDetail + BCRA", () => {
  it("muestra la ficha y consulta BCRA renderizando la deuda", async () => {
    renderWithProviders(<PersonaDetailPage />);
    expect(await screen.findByText(/Pérez/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /consultar bcra/i }));
    const panel = await screen.findByLabelText(/deuda bcra/i);
    expect(within(panel).getByText(/Banco Provincia/)).toBeInTheDocument();
    expect(within(panel).getByText("$ 450.000,00")).toBeInTheDocument();
  });
});
