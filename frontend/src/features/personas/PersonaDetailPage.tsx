import { useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { usePersona, usePrestamos } from "@/lib/api/queries";
import { useFicha360 } from "@/features/crm/hooks";
import { MoneyText } from "@/components/MoneyText";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BcraPanel } from "./bcra";
import { FichaCliente360 } from "@/features/crm/FichaCliente360";
import type { components } from "@/lib/api/schema";

type Persona = components["schemas"]["PersonaOut"];
type Prestamo = components["schemas"]["PrestamoOut"];
type Tab = "actividad" | "ficha";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

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

// ─── Risk bucket → header band styling ────────────────────────────────────────
// Reusa exactamente la escala ordinal de FichaCliente360 para coherencia visual.

type RiskBucket = "0" | "30" | "60" | "90" | "castigo";

function getRiskBucket(dias: number): RiskBucket {
  if (dias <= 0) return "0";
  if (dias <= 30) return "30";
  if (dias <= 60) return "60";
  if (dias <= 90) return "90";
  return "castigo";
}

const BAND_BG: Record<RiskBucket, string> = {
  "0": "bg-risk-0/10",
  "30": "bg-risk-30/10",
  "60": "bg-risk-60/12",
  "90": "bg-risk-90/12",
  castigo: "bg-risk-castigo/15",
};

const BAND_STRIP: Record<RiskBucket, string> = {
  "0": "bg-risk-0",
  "30": "bg-risk-30",
  "60": "bg-risk-60",
  "90": "bg-risk-90",
  castigo: "bg-risk-castigo",
};

const RISK_TEXT: Record<RiskBucket, string> = {
  "0": "text-risk-0",
  "30": "text-risk-30",
  "60": "text-risk-60",
  "90": "text-risk-90",
  castigo: "text-risk-castigo",
};

const RISK_BADGE: Record<RiskBucket, string> = {
  "0": "bg-risk-0/10 text-risk-0 border-risk-0/25",
  "30": "bg-risk-30/10 text-risk-30 border-risk-30/25",
  "60": "bg-risk-60/10 text-risk-60 border-risk-60/25",
  "90": "bg-risk-90/10 text-risk-90 border-risk-90/25",
  castigo: "bg-risk-castigo/15 text-risk-castigo border-risk-castigo/30",
};

const RISK_LABEL: Record<RiskBucket, string> = {
  "0": "Al día",
  "30": "PAR 30",
  "60": "PAR 60",
  "90": "PAR 90",
  castigo: "Castigado",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PersonaDetailPage() {
  const { personaId } = useParams({ strict: false }) as { personaId: string };
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("actividad");

  const { data: persona, isLoading, isError } = usePersona(personaId);

  if (isError) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-neg-border bg-neg-bg p-4 text-sm text-neg"
      >
        <span aria-hidden="true" className="mt-px leading-none">
          ⚠
        </span>
        <span>No se pudo cargar la ficha de la persona. Reintentá más tarde.</span>
      </div>
    );
  }

  if (isLoading || !persona) {
    return <PersonaSkeleton />;
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
                "-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activo
                  ? "border-brand text-brand"
                  : "border-transparent text-text-muted hover:border-border-strong hover:text-text",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "actividad" ? (
        <div className="space-y-6">
          <FichaCliente360 personaId={personaId} />
          <PrestamosDelCliente personaId={personaId} />
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

// ─── Header band: risk-colored, avatar + identity + key signal ────────────────

function FichaHeader({
  persona,
  onNuevaSolicitud,
}: {
  persona: Persona;
  onNuevaSolicitud: () => void;
}) {
  // Risk bucket drives the band color. La ficha360 está cacheada (misma query
  // que usa FichaCliente360), así que esto no agrega un round-trip extra.
  const fichaQ = useFicha360(persona.id);
  const dias = fichaQ.data?.peor_bucket_dias ?? 0;
  const bucket = getRiskBucket(dias);
  const enMora = dias > 0;

  return (
    <header className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className={`relative ${BAND_BG[bucket]} px-6 py-5`}>
        {/* 4px risk strip */}
        <div aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${BAND_STRIP[bucket]}`} />

        <div className="flex flex-col gap-4 pl-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-brand/15 bg-[var(--brand-subtle)] text-brand shadow-xs"
            >
              <span className="text-base font-semibold tracking-tight" style={MONO}>
                {iniciales(persona.nombre, persona.apellido)}
              </span>
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-text">
                {persona.apellido}, {persona.nombre}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="uppercase tracking-wider text-text-subtle">CUIL</span>
                  <span style={MONO}>{persona.cuil}</span>
                </span>
                <span aria-hidden="true" className="text-border-strong">
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="uppercase tracking-wider text-text-subtle">DNI</span>
                  <span style={MONO}>{persona.dni}</span>
                </span>
                {persona.email && (
                  <>
                    <span aria-hidden="true" className="text-border-strong">
                      ·
                    </span>
                    <span className="truncate text-text-subtle">{persona.email}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/* Risk signal — only when we have data and there is mora */}
            {fichaQ.isSuccess && enMora && (
              <div className={`hidden text-right sm:block ${RISK_TEXT[bucket]}`}>
                <div className="text-2xl font-bold leading-none tabular-nums" style={MONO}>
                  {dias}
                </div>
                <div className="text-[10px] font-medium uppercase tracking-wider opacity-75">
                  días mora
                </div>
              </div>
            )}
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${RISK_BADGE[bucket]}`}
            >
              {RISK_LABEL[bucket]}
            </span>
            <Button onClick={onNuevaSolicitud}>Nueva solicitud</Button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Préstamos list ───────────────────────────────────────────────────────────

function PrestamosDelCliente({ personaId }: { personaId: string }) {
  const { data, isLoading, isError } = usePrestamos({ personaId });
  const navigate = useNavigate();
  const prestamos = data?.data ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <SectionLabel>Préstamos del cliente</SectionLabel>
        {prestamos.length > 0 && (
          <span
            className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-text-muted tabular-nums"
            style={MONO}
          >
            {prestamos.length}
          </span>
        )}
      </div>

      {isError ? (
        <p role="alert" className="px-6 py-5 text-sm text-neg">
          No se pudieron cargar los préstamos.
        </p>
      ) : isLoading ? (
        <ul className="divide-y divide-border">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-6 py-4">
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-surface-sunken" />
                <div className="h-3 w-44 animate-pulse rounded bg-surface-sunken" />
              </div>
              <div className="h-8 w-28 animate-pulse rounded-md bg-surface-sunken" />
            </li>
          ))}
        </ul>
      ) : prestamos.length === 0 ? (
        <PrestamosEmpty />
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
    </section>
  );
}

function PrestamosEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-surface-sunken">
        <span aria-hidden="true" className="text-lg text-text-subtle">
          ○
        </span>
      </div>
      <p className="text-sm text-text-muted">Sin préstamos todavía</p>
      <p className="text-xs text-text-subtle">Los préstamos desembolsados aparecerán acá.</p>
    </div>
  );
}

function PrestamoFila({ prestamo, onVer }: { prestamo: Prestamo; onVer: () => void }) {
  const tono = ESTADO_TONO[prestamo.estado] ?? "default";
  const stripClass = ESTADO_STRIP[prestamo.estado] ?? "bg-border-strong";
  const cuotas = plazoDe(prestamo);

  return (
    <li className="group relative flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition-colors duration-150 hover:bg-surface-sunken/40">
      <div
        aria-hidden="true"
        className={`absolute inset-y-2 left-0 w-0.5 rounded-full ${stripClass} opacity-0 transition-opacity duration-150 group-hover:opacity-100`}
      />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <MoneyText
            value={prestamo.monto_desembolsado ?? prestamo.capital}
            intent="neutral"
            className="text-base font-semibold tracking-tight"
          />
          <Badge tone={tono}>{prestamo.estado}</Badge>
        </div>
        <p className="text-xs text-text-subtle">
          {prestamo.fecha_desembolso ? (
            <>
              Desembolsado el <span style={MONO}>{prestamo.fecha_desembolso}</span>
            </>
          ) : (
            "Sin desembolsar"
          )}
          {cuotas ? (
            <>
              {" · "}
              <span style={MONO}>{cuotas}</span> cuotas
            </>
          ) : (
            ""
          )}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onVer}>
        Ver estado de cuenta
      </Button>
    </li>
  );
}

const ESTADO_STRIP: Record<string, string> = {
  vigente: "bg-pos",
  cancelado: "bg-border-strong",
  en_mora: "bg-neg",
  refinanciado: "bg-info",
};

// ─── Datos personales ─────────────────────────────────────────────────────────

function DatosFicha({ persona }: { persona: Persona }) {
  const domicilio = [
    `${persona.domicilio_calle} ${persona.domicilio_numero ?? ""}`.trim(),
    persona.domicilio_localidad,
    persona.domicilio_provincia,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <SectionLabel>Datos personales</SectionLabel>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-6 py-5 sm:grid-cols-3">
        <Field label="Teléfono" value={persona.telefono} mono />
        <Field label="Estado civil" value={persona.estado_civil} />
        <Field label="Tipo de vivienda" value={persona.tipo_vivienda} />
        <Field label="Localidad" value={persona.domicilio_localidad} />
        <Field label="Provincia" value={persona.domicilio_provincia} />
        <Field label="Empleador" value={persona.empleador} />
        <Field label="Domicilio" value={domicilio || "—"} className="col-span-2 sm:col-span-3" />
        <Field
          label="Ingresos declarados"
          value={<MoneyText value={persona.ingresos_declarados} />}
        />
        <Field
          label="Ingresos en blanco"
          value={<MoneyText value={persona.ingresos_en_blanco} />}
        />
        <Field
          label="Ingresos totales"
          value={<MoneyText value={persona.ingresos_totales} className="font-semibold text-text" />}
        />
      </dl>
    </section>
  );
}

function Referencias({ persona }: { persona: Persona }) {
  const referencias = persona.referencias ?? [];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <SectionLabel>Referencias</SectionLabel>
        {referencias.length > 0 && (
          <span
            className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-text-muted tabular-nums"
            style={MONO}
          >
            {referencias.length}
          </span>
        )}
      </div>
      {referencias.length === 0 ? (
        <p className="px-6 py-5 text-sm text-text-subtle">Sin referencias cargadas.</p>
      ) : (
        <ul className="divide-y divide-border">
          {referencias.map((r, i) => (
            <li
              key={r.id ?? i}
              className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{r.nombre}</p>
                <p className="text-xs text-text-subtle">{r.vinculo}</p>
              </div>
              <span className="text-sm text-text-muted" style={MONO}>
                {r.telefono}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted">{children}</h2>
  );
}

function Field({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  const isEmpty = value == null || value === "";
  return (
    <div className={["min-w-0", className].filter(Boolean).join(" ")}>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-text" style={mono && !isEmpty ? MONO : undefined}>
        {isEmpty ? <span className="text-text-subtle">—</span> : value}
      </dd>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function PersonaSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando ficha de la persona">
      {/* Header band ghost */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="relative bg-surface-sunken/40 px-6 py-5">
          <div className="absolute inset-y-0 left-0 w-1 animate-pulse bg-surface-sunken" />
          <div className="flex items-center gap-4 pl-3">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
            <div className="space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-surface-sunken" />
              <div className="h-3 w-60 animate-pulse rounded bg-surface-sunken" />
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar ghost */}
      <div className="flex gap-4 border-b border-border pb-2">
        <div className="h-4 w-36 animate-pulse rounded bg-surface-sunken" />
        <div className="h-4 w-32 animate-pulse rounded bg-surface-sunken" />
      </div>

      {/* Body ghost */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <div className="h-3 w-28 animate-pulse rounded bg-surface-sunken" />
        </div>
        <div className="space-y-3 px-6 py-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-surface-sunken" />
                <div className="h-3 w-44 animate-pulse rounded bg-surface-sunken" />
              </div>
              <div className="h-8 w-28 animate-pulse rounded-md bg-surface-sunken" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function iniciales(nombre: string, apellido: string): string {
  return `${nombre[0] ?? ""}${apellido[0] ?? ""}`.toUpperCase() || "?";
}

// El plazo vive en el snapshot de términos (al desembolso). Sin snapshot, no lo mostramos.
function plazoDe(prestamo: Prestamo): number | null {
  const snap = prestamo.snapshot_terminos;
  const n = snap?.["cantidad_cuotas"];
  return typeof n === "number" ? n : null;
}
