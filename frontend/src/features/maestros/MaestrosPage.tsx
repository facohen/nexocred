import { useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { CatalogoTab } from "./CatalogoTab";
import { LocalidadesTab } from "./LocalidadesTab";
import { VendedoresTab } from "./VendedoresTab";
import {
  useZonas,
  useCrearZona,
  useActualizarZona,
  useSectores,
  useCrearSector,
  useActualizarSector,
  useTemas,
  useCrearTema,
  useActualizarTema,
  useCanales,
  useCrearCanal,
  useActualizarCanal,
  useDisposiciones,
  useCrearDisposicion,
  useActualizarDisposicion,
  type DisposicionOut,
} from "./hooks";

type TabId =
  | "zonas"
  | "sectores"
  | "temas"
  | "canales"
  | "disposiciones"
  | "localidades"
  | "vendedores";

const MONO: CSSProperties = { fontFamily: "'Geist Mono', monospace" };

const TABS: { id: TabId; label: string }[] = [
  { id: "zonas", label: "Zonas" },
  { id: "sectores", label: "Sectores" },
  { id: "temas", label: "Temas" },
  { id: "canales", label: "Canales" },
  { id: "disposiciones", label: "Disposiciones" },
  { id: "localidades", label: "Localidades" },
  { id: "vendedores", label: "Vendedores" },
];

/* ── Tab bar — underline-active, 150ms (mismo lenguaje que InboxPage) ──────── */
function TabBar({
  active,
  onSelect,
  counts,
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
  counts: Partial<Record<TabId, number>>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Secciones de datos fijos"
      className="flex flex-wrap items-center gap-0 overflow-x-auto"
      style={{ borderBottom: "1px solid hsl(var(--border))" }}
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        const count = counts[t.id];
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(t.id)}
            className="group relative -mb-px flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            style={{
              color: isActive ? "hsl(var(--text))" : "hsl(var(--text-muted))",
              borderBottom: `2px solid ${isActive ? "hsl(var(--brand))" : "transparent"}`,
              transition: "color 150ms ease, border-color 150ms ease",
            }}
          >
            <span>{t.label}</span>
            {typeof count === "number" && (
              <span
                className="inline-flex min-w-[1.375rem] items-center justify-center rounded-full px-1.5 py-px text-[10px] font-semibold leading-none"
                style={{
                  ...MONO,
                  color: isActive ? "hsl(var(--brand))" : "hsl(var(--text-subtle))",
                  background: isActive ? "hsl(var(--brand-subtle))" : "hsl(var(--surface-sunken))",
                  border: `1px solid ${isActive ? "hsl(var(--brand-subtle))" : "hsl(var(--border))"}`,
                  transition: "all 150ms ease",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

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

  const counts: Partial<Record<TabId, number>> = {
    zonas: zonasData?.data.length,
    sectores: sectoresData?.data.length,
    temas: temasData?.data.length,
    canales: canalesData?.data.length,
    disposiciones: dispData?.data.length,
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1
          className="text-3xl font-bold tracking-tight text-text"
          style={{ letterSpacing: "-0.02em" }}
        >
          Datos fijos
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Catálogos maestros del sistema: zonas, sectores, canales, disposiciones, geografía y
          asignaciones.
        </p>
      </header>

      <TabBar active={tab} onSelect={setTab} counts={counts} />

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
            renderMeta={(item) => (
              <Badge tone={item.genera_cobro ? "success" : "default"}>
                {item.genera_cobro ? "Genera cobro" : "Sin cobro"}
              </Badge>
            )}
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
