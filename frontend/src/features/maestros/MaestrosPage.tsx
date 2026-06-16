import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CatalogoTab } from "./CatalogoTab";
import { LocalidadesTab } from "./LocalidadesTab";
import { VendedoresTab } from "./VendedoresTab";
import {
  useZonas, useCrearZona, useActualizarZona,
  useSectores, useCrearSector, useActualizarSector,
  useTemas, useCrearTema, useActualizarTema,
  useCanales, useCrearCanal, useActualizarCanal,
  useDisposiciones, useCrearDisposicion, useActualizarDisposicion,
  type DisposicionOut,
} from "./hooks";

type TabId = "zonas" | "sectores" | "temas" | "canales" | "disposiciones" | "localidades" | "vendedores";

const TABS: { id: TabId; label: string }[] = [
  { id: "zonas", label: "Zonas" },
  { id: "sectores", label: "Sectores" },
  { id: "temas", label: "Temas" },
  { id: "canales", label: "Canales" },
  { id: "disposiciones", label: "Disposiciones" },
  { id: "localidades", label: "Localidades" },
  { id: "vendedores", label: "Vendedores" },
];

export function MaestrosPage() {
  const [tab, setTab] = useState<TabId>("zonas");

  // Zonas
  const { data: zonasData, isLoading: zLoading, isError: zError } = useZonas();
  const crearZona = useCrearZona();
  const actualizarZona = useActualizarZona();

  // Sectores
  const { data: sectoresData, isLoading: sLoading, isError: sError } = useSectores();
  const crearSector = useCrearSector();
  const actualizarSector = useActualizarSector();

  // Temas
  const { data: temasData, isLoading: tLoading, isError: tError } = useTemas();
  const crearTema = useCrearTema();
  const actualizarTema = useActualizarTema();

  // Canales
  const { data: canalesData, isLoading: cLoading, isError: cError } = useCanales();
  const crearCanal = useCrearCanal();
  const actualizarCanal = useActualizarCanal();

  // Disposiciones
  const { data: dispData, isLoading: dLoading, isError: dError } = useDisposiciones();
  const crearDisp = useCrearDisposicion();
  const actualizarDisp = useActualizarDisposicion();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">Datos fijos</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Catálogos maestros del sistema: zonas, sectores, canales, disposiciones, geografía y asignaciones.
        </p>
      </div>

      {/* Tabs */}
      <nav
        aria-label="Secciones de datos fijos"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-brand text-brand"
                : "text-text-muted hover:text-text",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div>
        {tab === "zonas" && (
          <CatalogoTab
            titulo="Zonas de ventas"
            descripcion="Regiones geográficas de la red de ventas."
            items={zonasData?.data ?? []}
            isLoading={zLoading}
            isError={zError}
            onCreate={(datos) => crearZona.mutate(datos)}
            onToggle={(item) => actualizarZona.mutate({ id: item.id, activo: !item.activo })}
            isCreating={crearZona.isPending}
          />
        )}

        {tab === "sectores" && (
          <CatalogoTab
            titulo="Sectores / Canales de originación"
            descripcion="Canal por donde se origina el crédito (call center, web, presencial)."
            items={sectoresData?.data ?? []}
            isLoading={sLoading}
            isError={sError}
            onCreate={(datos) => crearSector.mutate(datos)}
            onToggle={(item) => actualizarSector.mutate({ id: item.id, activo: !item.activo })}
            isCreating={crearSector.isPending}
          />
        )}

        {tab === "temas" && (
          <CatalogoTab
            titulo="Temas de interacción"
            descripcion="Motivo o tema de una gestión CRM."
            items={temasData?.data ?? []}
            isLoading={tLoading}
            isError={tError}
            onCreate={(datos) => crearTema.mutate(datos)}
            onToggle={(item) => actualizarTema.mutate({ id: item.id, activo: !item.activo })}
            isCreating={crearTema.isPending}
          />
        )}

        {tab === "canales" && (
          <CatalogoTab
            titulo="Canales de contacto"
            descripcion="Medio por el que se realizó la gestión (teléfono, WhatsApp, email…)."
            items={canalesData?.data ?? []}
            isLoading={cLoading}
            isError={cError}
            onCreate={(datos) => crearCanal.mutate(datos)}
            onToggle={(item) => actualizarCanal.mutate({ id: item.id, activo: !item.activo })}
            isCreating={crearCanal.isPending}
          />
        )}

        {tab === "disposiciones" && (
          <CatalogoTab<DisposicionOut>
            titulo="Disposiciones de gestión"
            descripcion="Resultado unificado de una gestión CRM o visita de ruta."
            items={dispData?.data ?? []}
            isLoading={dLoading}
            isError={dError}
            columns={[
              { key: "codigo", label: "Código" },
              { key: "nombre", label: "Nombre" },
              {
                key: "genera_cobro",
                label: "Genera cobro",
                render: (v) => (
                  <Badge tone={v ? "default" : "info"}>{v ? "Sí" : "No"}</Badge>
                ),
              },
              { key: "orden", label: "Orden" },
              {
                key: "activo",
                label: "Estado",
                render: (v) => (
                  <Badge tone={v ? "default" : "info"}>{v ? "Activo" : "Inactivo"}</Badge>
                ),
              },
            ]}
            onCreate={(datos) => crearDisp.mutate(datos)}
            onToggle={(item) => actualizarDisp.mutate({ id: item.id, activo: !item.activo })}
            isCreating={crearDisp.isPending}
          />
        )}

        {tab === "localidades" && <LocalidadesTab />}
        {tab === "vendedores" && <VendedoresTab />}
      </div>
    </div>
  );
}
