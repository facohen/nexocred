import { useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { usePersona, usePrestamos } from "@/lib/api/queries";
import { MoneyText } from "@/components/MoneyText";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BcraPanel } from "./bcra";
import { TimelinePanel } from "@/features/crm/TimelinePanel";
import type { components } from "@/lib/api/schema";

type Prestamo = components["schemas"]["PrestamoOut"];
type Tab = "actividad" | "ficha";

const TABS: { key: Tab; label: string }[] = [
  { key: "actividad", label: "Préstamos y actividad" },
  { key: "ficha", label: "Ficha y referencias" },
];

// Estados de préstamo → tono del badge. El backend usa strings libres; mapeamos
// los conocidos y caemos a "default" para el resto (sin romper si aparece uno nuevo).
const ESTADO_TONO: Record<string, BadgeTone> = {
  vigente: "success",
  cancelado: "default",
  en_mora: "danger",
  refinanciado: "info",
};

export function PersonaDetailPage() {
  const { personaId } = useParams({ strict: false }) as { personaId: string };
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("actividad");

  const { data: persona, isLoading, isError } = usePersona(personaId);

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-neg-border bg-neg-bg p-3 text-sm text-neg"
      >
        No se pudo cargar la ficha de la persona. Reintentá más tarde.
      </div>
    );
  }

  if (isLoading || !persona) {
    return <div className="animate-pulse text-text-subtle">Cargando ficha…</div>;
  }

  return (
    <div className="space-y-6">
      <FichaHeader
        persona={persona}
        onNuevaSolicitud={() => navigate({ to: "/originar" as string })}
      />

      <nav className="flex gap-1 border-b border-border" aria-label="Secciones de la ficha">
        {TABS.map((t) => {
          const activo = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={activo ? "page" : undefined}
              className={[
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                activo
                  ? "border-brand text-brand"
                  : "border-transparent text-text-muted hover:text-text",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "actividad" ? (
        <div className="space-y-6">
          <PrestamosDelCliente personaId={personaId} />
          <TimelinePanel personaId={personaId} />
        </div>
      ) : (
        <div className="space-y-6">
          <DatosFicha persona={persona} />
          <Referencias persona={persona} />
          <BcraPanel personaId={personaId} />
        </div>
      )}
    </div>
  );
}

function FichaHeader({
  persona,
  onNuevaSolicitud,
}: {
  persona: components["schemas"]["PersonaOut"];
  onNuevaSolicitud: () => void;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-subtle text-base font-semibold text-brand"
        >
          {iniciales(persona.nombre, persona.apellido)}
        </div>
        <div>
          <h1 className="text-xl font-bold text-text">
            {persona.apellido}, {persona.nombre}
          </h1>
          <p className="text-sm text-text-muted">
            DNI {persona.dni} · CUIL {persona.cuil}
          </p>
          {persona.email && <p className="text-sm text-text-subtle">{persona.email}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onNuevaSolicitud}>Nueva solicitud</Button>
      </div>
    </header>
  );
}

function PrestamosDelCliente({ personaId }: { personaId: string }) {
  const { data, isLoading, isError } = usePrestamos({ personaId });
  const navigate = useNavigate();
  const prestamos = data?.data ?? [];

  return (
    <Card>
      <CardTitle>Préstamos del cliente</CardTitle>

      {isError ? (
        <p role="alert" className="text-sm text-neg">
          No se pudieron cargar los préstamos.
        </p>
      ) : isLoading ? (
        <p className="animate-pulse text-sm text-text-subtle">Cargando préstamos…</p>
      ) : prestamos.length === 0 ? (
        <p className="text-sm text-text-subtle">Este cliente todavía no tiene préstamos.</p>
      ) : (
        <ul className="divide-y divide-border">
          {prestamos.map((p) => (
            <PrestamoFila
              key={p.id}
              prestamo={p}
              onVer={() => navigate({ to: `/prestamos/${p.id}` as string })}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PrestamoFila({ prestamo, onVer }: { prestamo: Prestamo; onVer: () => void }) {
  const tono = ESTADO_TONO[prestamo.estado] ?? "default";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <MoneyText
            value={prestamo.monto_desembolsado ?? prestamo.capital}
            intent="neutral"
            className="font-semibold"
          />
          <Badge tone={tono}>{prestamo.estado}</Badge>
        </div>
        <p className="text-xs text-text-subtle">
          {prestamo.fecha_desembolso
            ? `Desembolsado el ${prestamo.fecha_desembolso}`
            : "Sin desembolsar"}
          {plazoDe(prestamo) ? ` · ${plazoDe(prestamo)} cuotas` : ""}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onVer}>
        Ver estado de cuenta
      </Button>
    </li>
  );
}

function DatosFicha({ persona }: { persona: components["schemas"]["PersonaOut"] }) {
  return (
    <Card>
      <CardTitle>Datos personales</CardTitle>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Teléfono" value={persona.telefono} />
        <Field label="Estado civil" value={persona.estado_civil} />
        <Field
          label="Domicilio"
          value={`${persona.domicilio_calle} ${persona.domicilio_numero ?? ""}, ${persona.domicilio_localidad}`}
        />
        <Field label="Tipo de vivienda" value={persona.tipo_vivienda} />
        <Field label="Empleador" value={persona.empleador} />
        <Field
          label="Ingresos declarados"
          value={<MoneyText value={persona.ingresos_declarados} />}
        />
        <Field
          label="Ingresos en blanco"
          value={<MoneyText value={persona.ingresos_en_blanco} />}
        />
        <Field label="Ingresos totales" value={<MoneyText value={persona.ingresos_totales} />} />
      </dl>
    </Card>
  );
}

function Referencias({ persona }: { persona: components["schemas"]["PersonaOut"] }) {
  const referencias = persona.referencias ?? [];
  return (
    <Card>
      <CardTitle>Referencias</CardTitle>
      {referencias.length === 0 ? (
        <p className="text-sm text-text-subtle">Sin referencias.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {referencias.map((r, i) => (
            <li key={r.id ?? i}>
              {r.nombre} — {r.vinculo} — {r.telefono}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

function iniciales(nombre: string, apellido: string): string {
  return `${nombre[0] ?? ""}${apellido[0] ?? ""}`.toUpperCase() || "?";
}

// El plazo vive en el snapshot de términos (al desembolso). Sin snapshot, no lo mostramos.
function plazoDe(prestamo: Prestamo): number | null {
  const snap = prestamo.snapshot_terminos;
  const n = snap?.["cantidad_cuotas"];
  return typeof n === "number" ? n : null;
}
