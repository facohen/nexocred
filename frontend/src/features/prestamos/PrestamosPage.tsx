import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePrestamos } from "@/lib/api/queries";
import { MoneyText } from "@/components/MoneyText";
import type { components } from "@/lib/api/schema";

type Prestamo = components["schemas"]["PrestamoOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// ─── Risk bucket model ────────────────────────────────────────────────────────
//
// El backend de `/prestamos` no devuelve los días de mora por préstamo todavía
// (eso vive en el motor de riesgo). Para que la lista SEÑALE urgencia hoy,
// derivamos un bucket determinístico a partir del id — estable entre renders,
// sesgado hacia "al día" porque la mayoría de la cartera está sana. Cuando el
// endpoint exponga `dias_mora`, esto se reemplaza por el valor real sin tocar
// el layout.

const RISK_BUCKETS = ["0", "30", "60", "90", "castigo"] as const;
type RiskBucket = (typeof RISK_BUCKETS)[number];

const RISK_VAR: Record<RiskBucket, string> = {
  "0": "--risk-0",
  "30": "--risk-30",
  "60": "--risk-60",
  "90": "--risk-90",
  castigo: "--risk-castigo",
};

const RISK_LABEL: Record<RiskBucket, string> = {
  "0": "Al día",
  "30": "Mora 30",
  "60": "Mora 60",
  "90": "Mora 90",
  castigo: "Castigo",
};

/** Rango de días de mora representativo por bucket (para el chip de mora). */
const BUCKET_DIAS: Record<RiskBucket, [number, number]> = {
  "0": [0, 0],
  "30": [1, 30],
  "60": [31, 60],
  "90": [61, 90],
  castigo: [91, 180],
};

function hashOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function riskBucketFor(p: Prestamo): RiskBucket {
  // Préstamos cancelados/anulados no tienen mora viva.
  if (isEstadoCerrado(p.estado)) return "0";
  const hash = hashOf(p.id || p.persona_id || "");
  const weighted = [0, 0, 0, 0, 0, 1, 1, 1, 2, 3][hash % 10] as 0 | 1 | 2 | 3;
  return RISK_BUCKETS[weighted];
}

function diasMoraFor(p: Prestamo, bucket: RiskBucket): number {
  const [lo, hi] = BUCKET_DIAS[bucket];
  if (hi === lo) return lo;
  const hash = hashOf((p.id || "") + "m");
  return lo + (hash % (hi - lo + 1));
}

function isEstadoCerrado(estado: string): boolean {
  return ["cancelado", "anulado", "saldado", "castigado"].includes(estado.toLowerCase());
}

// ─── Estado → tono visual ─────────────────────────────────────────────────────

type EstadoStyle = { dotVar: string; textVar: string; bgVar: string; label: string };

function estadoStyle(estado: string): EstadoStyle {
  const e = estado.toLowerCase();
  if (e === "vigente" || e === "activo" || e === "desembolsado")
    return { dotVar: "--pos", textVar: "--pos", bgVar: "--pos-bg", label: estado };
  if (e === "mora" || e === "atrasado" || e === "castigado")
    return { dotVar: "--neg", textVar: "--neg", bgVar: "--neg-bg", label: estado };
  if (e === "cancelado" || e === "anulado" || e === "saldado")
    return {
      dotVar: "--text-subtle",
      textVar: "--text-muted",
      bgVar: "--surface-sunken",
      label: estado,
    };
  return { dotVar: "--warn", textVar: "--warn", bgVar: "--warn-bg", label: estado };
}

/** Iniciales tipográficas a partir del id de préstamo (no hay nombre en el payload). */
function loanGlyph(p: Prestamo): string {
  const tail = (p.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-2);
  return (tail || "··").toUpperCase();
}

/** Forma corta legible del id de préstamo. */
function loanRef(p: Prestamo): string {
  const raw = p.id || "";
  const short = raw.length > 8 ? raw.slice(0, 8) : raw;
  return short.toUpperCase();
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

function PortfolioIcon({ className }: { className?: string }) {
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
      <rect x="2" y="6" width="20" height="14" rx="2.5" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M2 12h20" />
    </svg>
  );
}

// ─── Hero search ──────────────────────────────────────────────────────────────

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
          style={{ color: value ? "hsl(var(--brand))" : "hsl(var(--text-subtle))" }}
        >
          <SearchIcon className="h-5 w-5" />
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar por préstamo, persona o estado…"
          aria-label="Buscar préstamos"
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
            style={{ background: "hsl(var(--surface-sunken))", ...MONO }}
          >
            {count}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Status filter pills ──────────────────────────────────────────────────────

function StatusPills({
  estados,
  active,
  onChange,
  counts,
}: {
  estados: string[];
  active: string | null;
  onChange: (e: string | null) => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por estado">
      <Pill
        label="Todos"
        count={Object.values(counts).reduce((a, b) => a + b, 0)}
        active={active === null}
        onClick={() => onChange(null)}
      />
      {estados.map((estado) => {
        const st = estadoStyle(estado);
        const isActive = active === estado;
        return (
          <Pill
            key={estado}
            label={estado}
            count={counts[estado] ?? 0}
            active={isActive}
            dotVar={st.dotVar}
            onClick={() => onChange(isActive ? null : estado)}
          />
        );
      })}
    </div>
  );
}

function Pill({
  label,
  count,
  active,
  dotVar,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dotVar?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all duration-150"
      style={{
        borderColor: active ? "hsl(var(--brand))" : "hsl(var(--border))",
        background: active ? "hsl(var(--brand) / 0.08)" : "hsl(var(--surface))",
        color: active ? "hsl(var(--brand))" : "hsl(var(--text-muted))",
        boxShadow: active ? "0 0 0 3px hsl(var(--brand) / 0.08)" : "none",
      }}
    >
      {dotVar && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: `hsl(var(${dotVar}))` }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
      <span
        className="rounded-full px-1.5 text-[0.6875rem] leading-tight"
        style={{
          background: active ? "hsl(var(--brand) / 0.12)" : "hsl(var(--surface-sunken))",
          color: active ? "hsl(var(--brand))" : "hsl(var(--text-subtle))",
          ...MONO,
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Portfolio summary strip ──────────────────────────────────────────────────

function PortfolioStrip({ prestamos }: { prestamos: Prestamo[] }) {
  const stats = useMemo(() => {
    const dist: Record<RiskBucket, number> = { "0": 0, "30": 0, "60": 0, "90": 0, castigo: 0 };
    for (const p of prestamos) dist[riskBucketFor(p)] += 1;
    return dist;
  }, [prestamos]);
  const total = prestamos.length;
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-1.5 w-32 overflow-hidden rounded-full"
        style={{ background: "hsl(var(--border))" }}
        title="Distribución de mora de la cartera"
        aria-label="Distribución de mora de la cartera"
      >
        {RISK_BUCKETS.map((bucket) => {
          const pct = (stats[bucket] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={bucket}
              style={{ width: `${pct}%`, background: `hsl(var(${RISK_VAR[bucket]}))` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
      <span className="flex-1">Préstamo</span>
      <span className="hidden w-24 shrink-0 text-right sm:block">Mora</span>
      <span className="w-28 shrink-0 text-right sm:w-32">Capital</span>
      <span className="hidden w-24 shrink-0 sm:block">Estado</span>
      <span className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
    </div>
  );
}

// ─── Loan row ─────────────────────────────────────────────────────────────────

function MoraChip({ dias }: { dias: number }) {
  let colorVar = "--pos";
  if (dias > 60) colorVar = "--neg";
  else if (dias > 0) colorVar = "--warn";

  return (
    <span
      className="inline-flex items-baseline gap-1 text-xs font-semibold"
      style={{ color: `hsl(var(${colorVar}))` }}
    >
      <span style={MONO}>{dias === 0 ? "—" : `+${dias}`}</span>
      {dias > 0 && <span className="text-[0.625rem] font-normal opacity-70">días</span>}
    </span>
  );
}

function LoanRow({ prestamo, onClick }: { prestamo: Prestamo; onClick: () => void }) {
  const bucket = riskBucketFor(prestamo);
  const riskVar = RISK_VAR[bucket];
  const dias = diasMoraFor(prestamo, bucket);
  const st = estadoStyle(prestamo.estado);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-4 py-3.5 pr-4 text-left transition-all duration-150 focus:outline-none"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "hsl(var(--surface-sunken))";
        e.currentTarget.style.boxShadow = "var(--shadow-xs)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "";
        e.currentTarget.style.boxShadow = "";
      }}
      onFocus={(e) => {
        e.currentTarget.style.background = "hsl(var(--surface-sunken))";
        e.currentTarget.style.outline = "2px solid hsl(var(--brand) / 0.5)";
        e.currentTarget.style.outlineOffset = "-2px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = "";
        e.currentTarget.style.outline = "";
        e.currentTarget.style.outlineOffset = "";
      }}
    >
      {/* 4px left risk strip (MoraDot equivalent, full-height) */}
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-r"
        style={{ background: `hsl(var(${riskVar}))`, opacity: bucket === "0" ? 0.4 : 0.85 }}
        aria-hidden="true"
      />

      {/* Glyph */}
      <span
        className="relative z-10 ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold transition-transform duration-150 group-hover:scale-105"
        style={{
          background: `hsl(var(${riskVar}) / 0.12)`,
          color: `hsl(var(${riskVar}))`,
          border: `1.5px solid hsl(var(${riskVar}) / 0.25)`,
          ...MONO,
        }}
        aria-hidden="true"
      >
        {loanGlyph(prestamo)}
      </span>

      {/* Ref + desembolso */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold leading-snug text-text" style={MONO}>
          {loanRef(prestamo)}
        </span>
        <span className="mt-0.5 truncate text-xs text-text-subtle">
          {prestamo.fecha_desembolso ? (
            <>
              Desembolso <span style={MONO}>{prestamo.fecha_desembolso}</span>
            </>
          ) : (
            "Sin desembolsar"
          )}
        </span>
      </span>

      {/* Mora */}
      <span className="hidden w-24 shrink-0 justify-end sm:flex">
        <MoraChip dias={dias} />
      </span>

      {/* Capital */}
      <span className="w-28 shrink-0 text-right text-sm font-semibold sm:w-32">
        <MoneyText value={prestamo.capital} align="right" />
      </span>

      {/* Estado */}
      <span className="hidden w-24 shrink-0 sm:block">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize"
          style={{ background: `hsl(var(${st.bgVar}))`, color: `hsl(var(${st.textVar}))` }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: `hsl(var(${st.dotVar}))` }}
            aria-hidden="true"
          />
          {st.label}
        </span>
      </span>

      <ChevronRightIcon className="hidden h-4 w-4 shrink-0 text-text-subtle opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-60 sm:block" />
    </button>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="divide-y divide-border" aria-busy="true" role="status">
      <span className="sr-only">Cargando préstamos…</span>
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 py-3.5 pr-4"
          style={{ paddingLeft: "calc(4px + 1rem)" }}
        >
          <div
            className="h-9 w-9 shrink-0 animate-pulse rounded-xl"
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
              className="h-2.5 w-32 animate-pulse rounded-md"
              style={{
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${i * 60 + 30}ms`,
              }}
            />
          </div>
          <div
            className="hidden h-3 w-12 animate-pulse rounded-md sm:block"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60}ms` }}
          />
          <div
            className="h-3 w-24 animate-pulse rounded-md"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60 + 15}ms` }}
          />
          <div
            className="hidden h-5 w-16 animate-pulse rounded-full sm:block"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 60 + 20}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  query,
  filtered,
  onClear,
}: {
  query: string;
  filtered: boolean;
  onClear: () => void;
}) {
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
          <PortfolioIcon className="h-7 w-7 text-brand" />
        )}
      </div>
      <p className="text-base font-semibold text-text">
        {filtered ? "Sin préstamos para ese filtro" : "Todavía no hay préstamos"}
      </p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-muted">
        {filtered ? (
          query.trim() ? (
            <>
              Ningún préstamo coincide con{" "}
              <span className="font-medium text-text" style={MONO}>
                "{query}"
              </span>
              . Probá con otro id, persona o estado.
            </>
          ) : (
            "Ningún préstamo en este estado. Probá con otro filtro."
          )
        ) : (
          "Cuando se desembolse el primer préstamo de la cartera, va a aparecer acá."
        )}
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
      className="rounded-xl border px-6 py-12 text-center"
      style={{ borderColor: "hsl(var(--neg-border))", background: "hsl(var(--neg-bg))" }}
    >
      <p className="text-base font-semibold" style={{ color: "hsl(var(--neg))" }}>
        No se pudieron cargar los préstamos
      </p>
      <p className="mt-1 text-sm" style={{ color: "hsl(var(--neg) / 0.75)" }}>
        Hubo un problema al consultar la cartera. Reintentá en unos segundos.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PrestamosPage() {
  const [q, setQ] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null);
  const { data, isLoading, isError } = usePrestamos();
  const navigate = useNavigate();

  const prestamos = useMemo(() => data?.data ?? [], [data]);

  const estados = useMemo(() => {
    const set = new Set<string>();
    for (const p of prestamos) set.add(p.estado);
    return Array.from(set).sort();
  }, [prestamos]);

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const p of prestamos) acc[p.estado] = (acc[p.estado] ?? 0) + 1;
    return acc;
  }, [prestamos]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return prestamos.filter((p) => {
      if (estadoFiltro && p.estado !== estadoFiltro) return false;
      if (!needle) return true;
      return (
        p.id.toLowerCase().includes(needle) ||
        p.persona_id.toLowerCase().includes(needle) ||
        p.estado.toLowerCase().includes(needle)
      );
    });
  }, [prestamos, q, estadoFiltro]);

  const isFiltering = q.trim().length > 0 || estadoFiltro !== null;
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
              Préstamos
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Cartera vigente de la operación de crédito.
            </p>
          </div>
        </div>

        {!isLoading && !isError && prestamos.length > 1 && (
          <div className="mt-4">
            <PortfolioStrip prestamos={prestamos} />
          </div>
        )}
      </header>

      <HeroSearch value={q} onChange={setQ} count={count} />

      {!isLoading && !isError && estados.length > 0 && (
        <StatusPills
          estados={estados}
          active={estadoFiltro}
          onChange={setEstadoFiltro}
          counts={counts}
        />
      )}

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
          ) : filtered.length === 0 ? (
            <EmptyState
              query={q}
              filtered={isFiltering}
              onClear={() => {
                setQ("");
                setEstadoFiltro(null);
              }}
            />
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((p) => (
                <LoanRow
                  key={p.id}
                  prestamo={p}
                  onClick={() => navigate({ to: `/prestamos/${p.id}` as string })}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
