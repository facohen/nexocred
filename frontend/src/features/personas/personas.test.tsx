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

const BASE = "/api/v1";

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

async function fillFichaCompleta(cuil = "20-12345678-6") {
  await userEvent.type(screen.getByLabelText(/^apellido/i), "Gómez");
  await userEvent.type(screen.getByLabelText(/^nombre/i), "María");
  await userEvent.type(screen.getByLabelText(/^dni/i), "30111223");
  await userEvent.type(screen.getByLabelText(/^cuil/i), cuil);
  await userEvent.type(screen.getByLabelText(/^email/i), "m@x.com");
  await userEvent.type(screen.getByLabelText(/fecha de nac/i), "1990-01-01");
  await userEvent.selectOptions(screen.getByLabelText(/estado civil/i), "soltero");
  await userEvent.selectOptions(screen.getByLabelText(/tipo de vivienda/i), "propia");
  await userEvent.type(screen.getByLabelText(/^teléfono/i), "11-5555-1111");
  await userEvent.type(screen.getByLabelText(/calle/i), "Av. Siempreviva");
  // Provincia/localidad son selects en cascada que cargan del API
  await screen.findByRole("option", { name: "Buenos Aires" });
  await userEvent.selectOptions(screen.getByLabelText(/provincia/i), "prov-1");
  await screen.findByRole("option", { name: "La Plata" });
  await userEvent.selectOptions(screen.getByLabelText(/localidad/i), "loc-1");
  await userEvent.type(screen.getByLabelText(/ingresos declarados/i), "300000");
  await userEvent.type(screen.getByLabelText(/ingresos en blanco/i), "200000");
  await userEvent.type(screen.getByLabelText(/ingresos totales/i), "300000");
  await userEvent.type(screen.getByLabelText(/referencia.*nombre/i), "Juan");
  await userEvent.type(screen.getByLabelText(/referencia.*apellido/i), "Gómez");
  await userEvent.type(screen.getByLabelText(/referencia.*teléfono/i), "11-5555-2222");
  await userEvent.selectOptions(screen.getByLabelText(/referencia.*vínculo/i), "hermano");
}

describe("PersonaForm validacion", () => {
  it("bloquea el submit si falta ingresos_totales y muestra error en español", async () => {
    const onCreated = vi.fn();
    renderWithProviders(<PersonaForm onCreated={onCreated} />);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByText(/los ingresos totales son obligatorios/i)).toBeInTheDocument();
  });

  it("bloquea el submit si falta estado_civil o domicilio (campos obligatorios §1)", async () => {
    const onCreated = vi.fn();
    renderWithProviders(<PersonaForm onCreated={onCreated} />);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByText(/estado civil es obligatorio/i)).toBeInTheDocument();
    expect(screen.getByText(/localidad es obligatoria/i)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rechaza un CUIL con dígito verificador inválido (módulo 11) en el cliente", async () => {
    const onCreated = vi.fn();
    renderWithProviders(<PersonaForm onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText(/^cuil/i), "27-30111222-4");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByText(/cuil inválido.*verificador/i)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rechaza ingresos en blanco mayores a los totales", async () => {
    const onCreated = vi.fn();
    renderWithProviders(<PersonaForm onCreated={onCreated} />);
    await fillFichaCompleta();
    const enBlanco = screen.getByLabelText(/ingresos en blanco/i);
    await userEvent.clear(enBlanco);
    await userEvent.type(enBlanco, "999999");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByText(/en blanco no pueden superar/i)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("crea la persona cuando la ficha está completa y válida", async () => {
    const onCreated = vi.fn();
    renderWithProviders(<PersonaForm onCreated={onCreated} />);
    await fillFichaCompleta();
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
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
    await fillFichaCompleta("27-30111222-5");
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByText(/Ya existe una persona con ese CUIL/i)).toBeInTheDocument();
  });
});

describe("PersonaDetail 360", () => {
  it("muestra, en la pestaña de actividad, los préstamos del cliente (la 'ficha 360')", async () => {
    renderWithProviders(<PersonaDetailPage />);
    expect(await screen.findByRole("heading", { name: /Pérez/ })).toBeInTheDocument();

    // El préstamo de persona-2 (fixture) aparece con su monto desembolsado y estado.
    const seccion = await screen.findByText(/Préstamos del cliente/i);
    expect(seccion).toBeInTheDocument();
    expect(await screen.findByText("$ 292.500,00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ver estado de cuenta/i })).toBeInTheDocument();
  });

  it("muestra la ficha y consulta BCRA renderizando la deuda (pestaña Ficha)", async () => {
    renderWithProviders(<PersonaDetailPage />);
    expect(await screen.findByRole("heading", { name: /Pérez/ })).toBeInTheDocument();

    // BCRA y referencias viven en la pestaña "Ficha y referencias".
    await userEvent.click(screen.getByRole("button", { name: /ficha y referencias/i }));
    await userEvent.click(screen.getByRole("button", { name: /consultar bcra/i }));
    const panel = await screen.findByLabelText(/deuda bcra/i);
    expect(within(panel).getByText(/Banco Provincia/)).toBeInTheDocument();
    expect(within(panel).getByText("$ 450.000,00")).toBeInTheDocument();
  });

  it("muestra un estado de error (no 'Cargando…' infinito) cuando la ficha falla", async () => {
    server.use(
      http.get(`${BASE}/personas/:id`, () =>
        HttpResponse.json({ error: { code: "interno", message: "boom" } }, { status: 500 }),
      ),
    );
    renderWithProviders(<PersonaDetailPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cargar la ficha/i);
    expect(screen.queryByText(/cargando ficha/i)).not.toBeInTheDocument();
  });
});
