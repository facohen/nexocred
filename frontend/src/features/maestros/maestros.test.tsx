import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { MaestrosPage } from "./MaestrosPage";

const BASE = "/api/v1";

const ZONA_FIXTURE = { id: "z1", codigo: "norte", nombre: "Zona Norte", orden: 1, activo: true };
const SECTOR_FIXTURE = { id: "s1", codigo: "call_center", nombre: "Call Center", orden: 1, activo: true };
const PROV_FIXTURE = { id: "p1", codigo: "AR-B", nombre: "Buenos Aires", orden: 1, activo: true };
const LOC_FIXTURE = { id: "l1", provincia_id: "p1", codigo: null, nombre: "La Plata", activo: true };

function mockZonas(items = [ZONA_FIXTURE]) {
  server.use(
    http.get(`${BASE}/maestros/zonas`, () =>
      HttpResponse.json({ data: items, total: items.length, page: 1, per_page: 500 }),
    ),
  );
}

function mockSectores(items = [SECTOR_FIXTURE]) {
  server.use(
    http.get(`${BASE}/maestros/sectores`, () =>
      HttpResponse.json({ data: items, total: items.length, page: 1, per_page: 500 }),
    ),
  );
}

function mockProvincias(items = [PROV_FIXTURE]) {
  server.use(
    http.get(`${BASE}/maestros/provincias`, () =>
      HttpResponse.json({ data: items, total: items.length, page: 1, per_page: 500 }),
    ),
  );
}

function mockLocalidades(items = [LOC_FIXTURE]) {
  server.use(
    http.get(`${BASE}/maestros/localidades`, () =>
      HttpResponse.json({ data: items, total: items.length, page: 1, per_page: 1000 }),
    ),
  );
}

describe("MaestrosPage", () => {
  it("muestra tab Zonas por defecto con la zona del mock", async () => {
    mockZonas();
    renderWithProviders(<MaestrosPage />);
    expect(await screen.findByText("Zona Norte")).toBeInTheDocument();
  });

  it("cambia a tab Sectores y muestra el sector del mock", async () => {
    mockZonas();
    mockSectores();
    const user = userEvent.setup();
    renderWithProviders(<MaestrosPage />);
    await screen.findByText("Zona Norte");

    await user.click(screen.getByRole("button", { name: /sectores/i }));
    expect(await screen.findByText("Call Center")).toBeInTheDocument();
  });

  it("tab Localidades muestra selector de provincia y localidades al seleccionar", async () => {
    mockProvincias();
    mockLocalidades();
    const user = userEvent.setup();
    renderWithProviders(<MaestrosPage />);

    await user.click(screen.getByRole("button", { name: /localidades/i }));
    const select = await screen.findByRole("combobox", { name: /provincia/i });
    expect(select).toBeInTheDocument();

    await user.selectOptions(select, "p1");
    expect(await screen.findByText("La Plata")).toBeInTheDocument();
  });

  it("muestra estado vacío cuando no hay zonas", async () => {
    mockZonas([]);
    renderWithProviders(<MaestrosPage />);
    expect(await screen.findByText(/no hay registros/i)).toBeInTheDocument();
  });
});
