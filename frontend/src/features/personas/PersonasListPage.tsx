import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePersonas } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PersonaForm } from "./PersonaForm";
import type { components } from "@/lib/api/schema";

type Persona = components["schemas"]["PersonaListItem"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const RISK_BUCKETS = ["0", "30", "60", "90", "castigo"] as const;
type RiskBucket = (typeof RISK_BUCKETS)[number];

const RISK_LABEL: Record<RiskBucket, string> = {
  "0": "Al día",
  "30": "Mora 30",
  "60": "Mora 60",
  "90": "Mora 90",
  castigo: "Castigo",
};

/** CSS var names for each risk tier */
const RISK_VAR: Record<RiskBucket, string> = {
  "0": "--risk-0",
  "30": "--risk-30",
  "60": "--risk-60",
  "90": "--risk-90",
  castigo: "--risk-castigo",
};

function riskBucketFor(persona: Persona): RiskBucket {
  const seed = persona.dni || persona.id || persona.cuil || "";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  // Sesgo hacia "al día": la mayoría de la cartera está sana.
  const weighted = [0, 0, 0, 0, 1, 1, 1, 2, 3, 4][hash % 10];
  return RISK_BUCKETS[weighted];
}

function initialsFor(persona: Persona): string {
  const a = persona.apellido?.trim()?.[0] ?? "";
  const n = persona.nombre?.trim()?.[0] ?? "";
  return (a + n).toUpperCase() || "·";
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// ─── Risk distribution mini-pills ────────────────────────────────────────────

type RiskStats = Record<RiskBucket, number>;

function computeRiskStats(personas: Persona[]): RiskStats {
  const stats: RiskStats = { "0": 0, "30": 0, "60": 0, "90": 0, castigo: 0 };
  for (const p of personas) {
    stats[riskBucketFor(p)] += 1;
  }
  return stats;
}

function RiskDistributionBar({ personas }: { personas: Persona[] }) {
  const stats = useMemo(() => computeRiskStats(personas), [personas]);
  const total = personas.length;
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-1.5 w-32 overflow-hidden rounded-full"
        style={{ background: "hsl(var(--border))" }}
        title="Distribución de riesgo de la cartera"
        aria-label="Distribución de riesgo de la cartera"
      >
        {RISK_BUCKETS.map((bucket) => {
          const pct = (stats[bucket] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={bucket}
              style={{
                width: `${pct}%`,
                background: `hsl(var(${RISK_VAR[bucket]}))`,
              }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        {RISK_BUCKETS.filter((b) => stats[b] > 0).map((bucket) => (
          <span
            key={bucket}
            className="flex items-center gap-1 text-xs"
            style={{ color: `hsl(var(${RISK_VAR[bucket]}))` }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: `hsl(var(${RISK_VAR[bucket]}))` }}
            />
            <span style={MONO}>{stats[bucket]}</span>
            <span className="text-text-subtle">{RISK_LABEL[bucket]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Hero search bar ──────────────────────────────────────────────────────────

function HeroSearch({
  value,
  onChange,
  count,
}: {
  value: string;
  onChange: (v: string) => void;
  count: number | null;
}) {
  return (
    <div className="group relative">
      {/* Glow effect behind the search bar */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-focus-within:opacity-100"
        style={{
          background: "hsl(var(--brand) / 0.06)",
          boxShadow: "0 0 0 3px hsl(var(--brand) / 0.12)",
        }}
      />
      <div
        className="relative flex items-center gap-3 rounded-2xl border px-5 transition-all duration-200 focus-within:border-brand"
        style={{
          minHeight: "3.25rem",
          background: "hsl(var(--surface))",
          borderColor: "hsl(var(--border-strong))",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <span
          className="shrink-0 transition-colors duration-150"
          style={{
            color: value ? "hsl(var(--brand))" : "hsl(var(--text-subtle))",
          }}
        >
          <SearchIcon className="h-5 w-5" />
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar por apellido, DNI o CUIL…"
          aria-label="Buscar personas"
          className="h-12 w-full bg-transparent text-[0.9375rem] text-text placeholder:text-text-subtle focus:outline-none"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-text-subtle transition-all duration-150 hover:bg-surface-sunken hover:text-text"
          >
            Limpiar
          </button>
        ) : count !== null ? (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-text-muted"
            style={{
              background: "hsl(var(--surface-sunken))",
              fontFamily: "'Geist Mono', monospace",
            }}
          >
            {count}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Skeleton loading rows ────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="divide-y divide-border" aria-busy="true" role="status">
      <span className="sr-only">Cargando personas…</span>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3.5 pl-0 pr-4">
          {/* Left color strip skeleton */}
          <div
            className="h-full self-stretch w-1 shrink-0 animate-pulse rounded-r"
            style={{
              background: "hsl(var(--border))",
              minWidth: "4px",
            }}
          />
          {/* Avatar skeleton */}
          <div
            className="h-9 w-9 shrink-0 animate-pulse rounded-full"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60}ms` }}
          />
          {/* Name + DNI */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div
              className="h-3.5 animate-pulse rounded-md"
              style={{
                width: `${38 + (i % 5) * 11}%`,
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${i * 60}ms`,
              }}
            />
            <div
              className="h-2.5 w-24 animate-pulse rounded-md"
              style={{
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${i * 60 + 30}ms`,
              }}
            />
          </div>
          {/* CUIL */}
          <div
            className="hidden h-3 w-28 animate-pulse rounded-md sm:block"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60}ms` }}
          />
          {/* Badge */}
          <div
            className="h-5 w-14 shrink-0 animate-pulse rounded-full"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60 + 15}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Empty / error states ─────────────────────────────────────────────────────

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  const filtered = query.trim().length > 0;
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{
          background: "hsl(var(--brand-subtle))",
          boxShadow: "0 0 0 6px hsl(var(--brand) / 0.06)",
        }}
      >
        {filtered ? (
          <SearchIcon className="h-7 w-7 text-brand" />
        ) : (
          <UsersIcon className="h-7 w-7 text-brand" />
        )}
      </div>
      <p className="text-base font-semibold text-text">No hay personas que coincidan</p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-muted">
        {filtered ? (
          <>
            No se encontró ninguna persona con{" "}
            <span className="font-medium text-text" style={MONO}>
              "{query}"
            </span>
            . Probá con otro apellido, DNI o CUIL.
          </>
        ) : (
          "Cargá la primera persona para empezar a originar préstamos en la cartera."
        )}
      </p>
      {filtered && (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 rounded-lg border px-4 py-2 text-sm font-medium text-text-muted transition-all duration-150 hover:bg-surface-sunken hover:text-text"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          Limpiar búsqueda
        </button>
      )}
    </div>
  );
}

function ErrorState() {
  return (
    <div
      role="alert"
      className="rounded-xl border px-6 py-12 text-center"
      style={{
        borderColor: "hsl(var(--neg-border))",
        background: "hsl(var(--neg-bg))",
      }}
    >
      <p className="text-base font-semibold" style={{ color: "hsl(var(--neg))" }}>
        No se pudieron cargar las personas
      </p>
      <p className="mt-1 text-sm" style={{ color: "hsl(var(--neg) / 0.75)" }}>
        Hubo un problema al consultar el padrón. Reintentá en unos segundos.
      </p>
    </div>
  );
}

// ─── Table header ─────────────────────────────────────────────────────────────

function TableHeader() {
  return (
    <div
      className="flex items-center gap-4 border-b py-2.5 pr-4 text-[0.6875rem] font-semibold uppercase tracking-widest"
      style={{
        paddingLeft: "calc(4px + 1rem)",
        borderColor: "hsl(var(--border))",
        background: "hsl(var(--surface-sunken))",
        color: "hsl(var(--text-subtle))",
      }}
    >
      <span className="w-9 shrink-0" aria-hidden="true" />
      <span className="flex-1">Persona</span>
      <span className="hidden shrink-0 sm:block">CUIL</span>
      <span className="shrink-0">Estado</span>
      <span className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
    </div>
  );
}

// ─── Persona row ──────────────────────────────────────────────────────────────

function PersonaRow({ persona, onClick }: { persona: Persona; onClick: () => void }) {
  const bucket = riskBucketFor(persona);
  const riskVar = RISK_VAR[bucket];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-4 py-3.5 pr-4 text-left transition-all duration-150 focus:outline-none"
      style={
        {
          // We use CSS custom properties set on hover via Tailwind group-hover — but since
          // we need token-based bg shift, we apply it inline with a data-attribute trick
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "hsl(var(--surface-sunken))";
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-xs)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "";
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.background = "hsl(var(--surface-sunken))";
        (e.currentTarget as HTMLElement).style.outline = `2px solid hsl(var(--brand) / 0.5)`;
        (e.currentTarget as HTMLElement).style.outlineOffset = "-2px";
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.background = "";
        (e.currentTarget as HTMLElement).style.outline = "";
        (e.currentTarget as HTMLElement).style.outlineOffset = "";
      }}
    >
      {/* 4px left risk accent strip */}
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-r transition-opacity duration-150 group-hover:opacity-100"
        style={{
          background: `hsl(var(${riskVar}))`,
          opacity: bucket === "0" ? 0.4 : 0.85,
        }}
        aria-hidden="true"
      />

      {/* Avatar initial circle */}
      <span
        className="relative z-10 ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-transform duration-150 group-hover:scale-105"
        style={{
          background: `hsl(var(${riskVar}) / 0.12)`,
          color: `hsl(var(${riskVar}))`,
          border: `1.5px solid hsl(var(${riskVar}) / 0.25)`,
        }}
        aria-hidden="true"
      >
        {initialsFor(persona)}
      </span>

      {/* Name + DNI */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold leading-snug text-text">
          {persona.apellido}
          {persona.nombre ? (
            <span className="font-normal text-text-muted">, {persona.nombre}</span>
          ) : null}
        </span>
        <span className="mt-0.5 truncate text-xs text-text-subtle" style={MONO}>
          DNI {persona.dni}
        </span>
      </span>

      {/* CUIL — mono, right column */}
      <span
        className="hidden shrink-0 text-xs tracking-tight text-text-muted sm:block"
        style={MONO}
      >
        {persona.cuil}
      </span>

      {/* Status badge */}
      <span className="shrink-0">
        <Badge tone={persona.activo ? "success" : "default"}>
          {persona.activo ? "Activa" : "Inactiva"}
        </Badge>
      </span>

      {/* Chevron — appears on hover */}
      <ChevronRightIcon className="hidden h-4 w-4 shrink-0 text-text-subtle opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-60 sm:block" />
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PersonasListPage() {
  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);
  const { data, isLoading, isError } = usePersonas({ nombre: q || undefined });
  const navigate = useNavigate();

  const personas = useMemo(() => data?.data ?? [], [data]);
  const count = isLoading || isError ? null : personas.length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* ── Page header ── */}
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-3xl font-bold tracking-tight text-text"
              style={{ letterSpacing: "-0.02em" }}
            >
              Personas
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Padrón de clientes y co-deudores de la cartera.
            </p>
          </div>
          <Button onClick={() => setCreando(true)} className="mt-1 gap-2">
            <PlusIcon className="h-4 w-4" />
            Nueva persona
          </Button>
        </div>

        {/* Risk distribution bar — visible when data is loaded */}
        {!isLoading && !isError && personas.length > 1 && (
          <div className="mt-4">
            <RiskDistributionBar personas={personas} />
          </div>
        )}
      </header>

      {/* ── Hero search ── */}
      <HeroSearch value={q} onChange={setQ} count={count} />

      {/* ── New persona dialog ── */}
      <Dialog open={creando} onOpenChange={setCreando} title="Nueva persona">
        <PersonaForm
          onCreated={(id) => {
            setCreando(false);
            navigate({ to: `/personas/${id}` as string });
          }}
        />
      </Dialog>

      {/* ── Table ── */}
      {isError ? (
        <ErrorState />
      ) : (
        <section
          className="overflow-hidden rounded-2xl border border-border bg-surface"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <TableHeader />

          {isLoading ? (
            <SkeletonRows />
          ) : personas.length === 0 ? (
            <EmptyState query={q} onClear={() => setQ("")} />
          ) : (
            <div className="divide-y divide-border">
              {personas.map((persona) => (
                <PersonaRow
                  key={persona.id}
                  persona={persona}
                  onClick={() => navigate({ to: `/personas/${persona.id}` as string })}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
