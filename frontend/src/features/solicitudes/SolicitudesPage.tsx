import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSolicitudes } from "@/lib/api/queries";
import { MoneyText } from "@/components/MoneyText";
import type { components } from "@/lib/api/schema";

type Solicitud = components["schemas"]["SolicitudOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// ─── Estado model ─────────────────────────────────────────────────────────────
// El estado conduce el color: cada estado mapea a un token semántico (no
// decorativo). El strip izquierdo, el avatar y el chip comparten ese token.
//
// Los pills NO son un <select>: son toggles por FASE del ciclo de vida.
//   pendiente      → warn   (espera evaluación)
//   en_evaluacion  → brand  (en proceso del analista)
//   aprobada       → pos    (aprobada / desembolsada)
//   rechazada      → neg    (rechazada)

type EstadoKey =
  | "ingresada"
  | "en_evaluacion"
  | "evaluada"
  | "aprobada"
  | "rechazada"
  | "desembolsada";

type Tone = "warn" | "brand" | "pos" | "neg" | "info";

type FaseKey = "pendiente" | "en_evaluacion" | "aprobada" | "rechazada";

interface EstadoMeta {
  /** prefijo del token: --{tone}, --{tone}-bg, --{tone}-border */
  tone: Tone;
  label: string;
  /** Fase del ciclo de vida — agrupa los pill-toggles. */
  fase: FaseKey;
}

const ESTADO_META: Record<EstadoKey, EstadoMeta> = {
  ingresada: { tone: "warn", label: "Ingresada", fase: "pendiente" },
  en_evaluacion: { tone: "brand", label: "En evaluación", fase: "en_evaluacion" },
  evaluada: { tone: "brand", label: "Evaluada", fase: "en_evaluacion" },
  aprobada: { tone: "pos", label: "Aprobada", fase: "aprobada" },
  desembolsada: { tone: "pos", label: "Desembolsada", fase: "aprobada" },
  rechazada: { tone: "neg", label: "Rechazada", fase: "rechazada" },
};

const FALLBACK_META: EstadoMeta = { tone: "info", label: "—", fase: "pendiente" };

function metaFor(estado: string): EstadoMeta {
  return ESTADO_META[estado as EstadoKey] ?? { ...FALLBACK_META, label: estado };
}

const FASES: { key: FaseKey; label: string; tone: Tone }[] = [
  { key: "pendiente", label: "Pendientes", tone: "warn" },
  { key: "en_evaluacion", label: "En evaluación", tone: "brand" },
  { key: "aprobada", label: "Aprobadas", tone: "pos" },
  { key: "rechazada", label: "Rechazadas", tone: "neg" },
];

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function refId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function initialsFromId(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9]/g, "");
  return (clean.slice(0, 2) || "··").toUpperCase();
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

function InboxIcon({ className }: { className?: string }) {
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
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ meta }: { meta: EstadoMeta }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: `hsl(var(--${meta.tone}-bg))`,
        color: `hsl(var(--${meta.tone}))`,
        border: `1px solid hsl(var(--${meta.tone}-border))`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: `hsl(var(--${meta.tone}))` }}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}

// ─── Hero search ──────────────────────────────────────────────────────────────
// Elemento dominante: h-12, sombra elevada, anillo de marca al enfocar y conteo
// vivo en mono.

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
      <div
        className="relative flex items-center gap-3.5 rounded-2xl border px-5 shadow-lg transition-all duration-200 focus-within:border-brand focus-within:ring-2 focus-within:ring-[hsl(var(--brand))]/60"
        style={{
          minHeight: "3rem",
          background: "hsl(var(--surface))",
          borderColor: "hsl(var(--border-strong))",
        }}
      >
        <span
          className="shrink-0 transition-colors duration-150"
          style={{ color: value ? "hsl(var(--brand))" : "hsl(var(--text-subtle))" }}
        >
          <SearchIcon className="h-5 w-5" />
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar por ID de solicitud o cliente…"
          aria-label="Buscar solicitudes"
          className="h-12 w-full bg-transparent text-base text-text placeholder:text-text-subtle focus:outline-none"
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
            className="inline-flex shrink-0 items-baseline gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-text-muted"
            style={{ background: "hsl(var(--surface-sunken))" }}
          >
            <span style={MONO}>{count}</span>
            <span className="text-text-subtle">en cola</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Filter pills ─────────────────────────────────────────────────────────────
// Pill-toggles (no <select>): el pill activo usa el bg/texto del token.

function FasePills({
  active,
  counts,
  onToggle,
}: {
  active: Set<FaseKey>;
  counts: Record<FaseKey, number>;
  onToggle: (key: FaseKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FASES.map(({ key, label, tone }) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={isActive}
            className="group/pill inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 hover:-translate-y-px"
            style={
              isActive
                ? {
                    background: `hsl(var(--${tone}-bg))`,
                    color: `hsl(var(--${tone}))`,
                    borderColor: `hsl(var(--${tone}-border))`,
                  }
                : {
                    background: "hsl(var(--surface))",
                    color: "hsl(var(--text-muted))",
                    borderColor: "hsl(var(--border))",
                  }
            }
          >
            <span
              className="h-2 w-2 rounded-full transition-transform duration-150 group-hover/pill:scale-110"
              style={{
                background: `hsl(var(--${tone}))`,
                opacity: isActive ? 1 : 0.55,
              }}
              aria-hidden="true"
            />
            {label}
            <span
              className="rounded-full px-1.5 text-[0.6875rem] leading-relaxed"
              style={{
                ...MONO,
                background: isActive ? `hsl(var(--${tone}) / 0.16)` : "hsl(var(--surface-sunken))",
              }}
            >
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// 5 filas pulse que copian la forma real: strip, avatar, dos líneas, monto, chip.

function SkeletonRows() {
  return (
    <div className="divide-y divide-border" aria-busy="true" role="status">
      <span className="sr-only">Cargando solicitudes…</span>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="relative flex items-center gap-4 py-4 pr-4 pl-5">
          <span
            className="absolute inset-y-0 left-0 w-1 animate-pulse rounded-r"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60}ms` }}
            aria-hidden="true"
          />
          <div
            className="h-11 w-11 shrink-0 animate-pulse rounded-xl"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60}ms` }}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div
              className="h-3.5 animate-pulse rounded-md"
              style={{
                width: `${30 + (i % 4) * 12}%`,
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
          <div
            className="hidden h-4 w-24 animate-pulse rounded-md sm:block"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60}ms` }}
          />
          <div
            className="h-6 w-24 shrink-0 animate-pulse rounded-full"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60 + 15}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Empty / error ────────────────────────────────────────────────────────────

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
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
          <InboxIcon className="h-7 w-7 text-brand" />
        )}
      </div>
      <p className="text-base font-semibold text-text">
        {filtered ? "Ninguna solicitud coincide" : "Todavía no hay solicitudes"}
      </p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-muted">
        {filtered
          ? "Ajustá los filtros de estado o limpiá la búsqueda para ver toda la cola de originación."
          : "Cuando un vendedor origine un préstamo, la solicitud aparecerá acá para evaluar."}
      </p>
      {filtered && (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 rounded-lg border px-4 py-2 text-sm font-medium text-text-muted transition-all duration-150 hover:bg-surface-sunken hover:text-text"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

function ErrorState() {
  return (
    <div
      role="alert"
      className="rounded-2xl border px-6 py-12 text-center"
      style={{ borderColor: "hsl(var(--neg-border))", background: "hsl(var(--neg-bg))" }}
    >
      <p className="text-base font-semibold" style={{ color: "hsl(var(--neg))" }}>
        No se pudieron cargar las solicitudes
      </p>
      <p className="mt-1 text-sm" style={{ color: "hsl(var(--neg) / 0.75)" }}>
        Hubo un problema al consultar la cola de originación. Reintentá en unos segundos.
      </p>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
// 4px strip por estado · avatar initials (tinte por estado) · referencia bold ·
// id de cliente en mono · monto vía MoneyText · chip de estado.

function SolicitudRow({ solicitud, onClick }: { solicitud: Solicitud; onClick: () => void }) {
  const meta = metaFor(solicitud.estado);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-4 py-4 pr-4 pl-5 text-left transition-all duration-150 focus:outline-none"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "hsl(var(--surface-sunken))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "";
      }}
      onFocus={(e) => {
        e.currentTarget.style.background = "hsl(var(--surface-sunken))";
        e.currentTarget.style.outline = "2px solid hsl(var(--brand) / 0.5)";
        e.currentTarget.style.outlineOffset = "-2px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = "";
        e.currentTarget.style.outline = "";
      }}
    >
      {/* 4px status strip — grows on hover */}
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-r transition-all duration-150 group-hover:w-1.5"
        style={{ background: `hsl(var(--${meta.tone}))`, opacity: 0.85 }}
        aria-hidden="true"
      />

      {/* Avatar initials circle — brand/status-tinted */}
      <span
        className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-transform duration-150 group-hover:scale-105"
        style={{
          background: `hsl(var(--${meta.tone}) / 0.12)`,
          color: `hsl(var(--${meta.tone}))`,
          border: `1.5px solid hsl(var(--${meta.tone}) / 0.22)`,
          ...MONO,
        }}
        aria-hidden="true"
      >
        {initialsFromId(solicitud.persona_id)}
      </span>

      {/* Referencia + cliente */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold leading-snug text-text" style={MONO}>
          #{shortId(solicitud.id)}
          <span className="sr-only">{solicitud.id}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-text-subtle">
          <span>cliente</span>
          <span className="text-text-muted" style={MONO}>
            {refId(solicitud.persona_id)}
          </span>
          {solicitud.cantidad_cuotas != null ? (
            <>
              <span aria-hidden="true">·</span>
              <span style={MONO}>{solicitud.cantidad_cuotas}</span>
              <span>cuotas</span>
            </>
          ) : null}
        </span>
      </span>

      {/* Score — secondary mono signal */}
      {solicitud.score != null ? (
        <span className="hidden shrink-0 flex-col items-end md:flex">
          <span className="text-sm font-semibold text-text" style={MONO}>
            {solicitud.score}
          </span>
          <span className="text-[0.625rem] uppercase tracking-wider text-text-subtle">score</span>
        </span>
      ) : null}

      {/* Monto — primary number */}
      <span className="hidden shrink-0 flex-col items-end sm:flex">
        <MoneyText value={solicitud.monto ?? null} className="text-[0.9375rem] font-semibold" />
        <span className="text-[0.625rem] uppercase tracking-wider text-text-subtle">monto</span>
      </span>

      {/* Status chip */}
      <StatusChip meta={meta} />

      <ChevronRightIcon className="hidden h-4 w-4 shrink-0 text-text-subtle opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-60 sm:block" />
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SolicitudesPage() {
  const { data, isLoading, isError } = useSolicitudes();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [activeFases, setActiveFases] = useState<Set<FaseKey>>(new Set());

  const solicitudes = useMemo(() => data?.data ?? [], [data]);

  const faseCounts = useMemo(() => {
    const acc: Record<FaseKey, number> = {
      pendiente: 0,
      en_evaluacion: 0,
      aprobada: 0,
      rechazada: 0,
    };
    for (const s of solicitudes) acc[metaFor(s.estado).fase] += 1;
    return acc;
  }, [solicitudes]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return solicitudes.filter((s) => {
      const matchesFase = activeFases.size === 0 || activeFases.has(metaFor(s.estado).fase);
      const matchesTerm =
        term === "" ||
        s.id.toLowerCase().includes(term) ||
        s.persona_id.toLowerCase().includes(term);
      return matchesFase && matchesTerm;
    });
  }, [solicitudes, q, activeFases]);

  const toggleFase = (key: FaseKey) => {
    setActiveFases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasFilters = q.trim().length > 0 || activeFases.size > 0;
  const count = isLoading || isError ? null : filtered.length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-3xl font-bold tracking-tight text-text"
              style={{ letterSpacing: "-0.02em" }}
            >
              Solicitudes
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Cola de originación. El estado conduce la prioridad y el color.
            </p>
          </div>
        </div>

        {!isLoading && !isError && solicitudes.length > 0 && (
          <div className="mt-4">
            <FasePills active={activeFases} counts={faseCounts} onToggle={toggleFase} />
          </div>
        )}
      </header>

      <HeroSearch value={q} onChange={setQ} count={count} />

      {isError ? (
        <ErrorState />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {isLoading ? (
            <SkeletonRows />
          ) : filtered.length === 0 ? (
            <EmptyState
              filtered={hasFilters}
              onClear={() => {
                setQ("");
                setActiveFases(new Set());
              }}
            />
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((s) => (
                <SolicitudRow
                  key={s.id}
                  solicitud={s}
                  onClick={() => navigate({ to: `/solicitudes/${s.id}` as string })}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
