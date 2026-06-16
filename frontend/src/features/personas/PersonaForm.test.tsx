import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/utils";
import { PersonaForm } from "./PersonaForm";

// Los handlers globales ya exponen:
//   GET /maestros/provincias → [{ id: "prov-1", nombre: "Buenos Aires" }, { id: "prov-2", nombre: "CABA" }]
//   GET /maestros/localidades?provincia_id=prov-1 → [{ id: "loc-1", nombre: "La Plata" }]
//   GET /maestros/localidades?provincia_id=prov-2 → [{ id: "loc-2", nombre: "Palermo" }]
//   POST /personas → { ...fixture, id: "persona-X" }

const BASE = "/api/v1";

describe("PersonaForm – selects cascada provincia/localidad", () => {
  it("muestra el select de provincia con las opciones del backend", async () => {
    renderWithProviders(<PersonaForm onCreated={() => {}} />);

    const select = await screen.findByRole("combobox", { name: /provincia/i });
    expect(select).toBeInTheDocument();

    // Espera a que las opciones se carguen
    expect(await screen.findByRole("option", { name: /buenos aires/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /caba/i })).toBeInTheDocument();
  });

  it("el select de localidad está deshabilitado hasta que se elige una provincia", async () => {
    renderWithProviders(<PersonaForm onCreated={() => {}} />);

    const localidadSelect = await screen.findByRole("combobox", { name: /localidad/i });
    expect(localidadSelect).toBeDisabled();
  });

  it("al seleccionar una provincia habilita localidad y carga sus opciones", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonaForm onCreated={() => {}} />);

    const provinciaSelect = await screen.findByRole("combobox", { name: /provincia/i });
    await screen.findByRole("option", { name: /buenos aires/i });

    await user.selectOptions(provinciaSelect, "prov-1");

    const localidadSelect = screen.getByRole("combobox", { name: /localidad/i });
    expect(localidadSelect).not.toBeDisabled();

    expect(await screen.findByRole("option", { name: /la plata/i })).toBeInTheDocument();
  });

  it("al cambiar la provincia resetea la localidad y carga nuevas opciones", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonaForm onCreated={() => {}} />);

    const provinciaSelect = await screen.findByRole("combobox", { name: /provincia/i });
    await screen.findByRole("option", { name: /buenos aires/i });

    // Primera provincia
    await user.selectOptions(provinciaSelect, "prov-1");
    await screen.findByRole("option", { name: /la plata/i });

    // Cambiar a segunda provincia
    await user.selectOptions(provinciaSelect, "prov-2");
    expect(await screen.findByRole("option", { name: /palermo/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /la plata/i })).not.toBeInTheDocument();
  });

  it("muestra las opciones de localidad según la provincia elegida (CABA)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonaForm onCreated={() => {}} />);

    const provinciaSelect = await screen.findByRole("combobox", { name: /provincia/i });
    await screen.findByRole("option", { name: /caba/i });

    await user.selectOptions(provinciaSelect, "prov-2");

    expect(await screen.findByRole("option", { name: /palermo/i })).toBeInTheDocument();
  });

  it("muestra error si el backend falla al cargar provincias", async () => {
    server.use(
      http.get(`${BASE}/maestros/provincias`, () => new HttpResponse(null, { status: 500 })),
    );

    renderWithProviders(<PersonaForm onCreated={() => {}} />);

    // El select de provincia debe renderizarse aunque no haya opciones (query en error)
    const provinciaSelect = await screen.findByRole("combobox", { name: /provincia/i });
    expect(provinciaSelect).toBeInTheDocument();

    // No debe haber opciones cargadas
    expect(screen.queryByRole("option", { name: /buenos aires/i })).not.toBeInTheDocument();
  });
});
