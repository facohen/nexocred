import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { useAlertas, useResolverAlerta, useAsignarAlerta } from "./hooks";
import type { components } from "@/lib/api/schema";

type Alerta = components["schemas"]["AlertaOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// ─── Modelo de severidad ──────────────────────────────────────────────────────
//
// Tres tiers de severidad descendente, replicando la jerarquía de bandeja de
// BandejaHome: CRÍTICAS dominan la página (riesgo-90/neg), ATENCIÓN en el medio
// (warn), INFORMATIVAS muteadas. El color SEÑALA urgencia — maneja el strip de
// 4px, el borde de la tarjeta y el badge de conteo del grupo.

type Tier = "critica" | "atencion" | "info";

const TIER_ORDER: Tier[] = ["critica", "atencion", "info"];

function tierOf(severidad: string | null | undefined): Tier {
  switch ((severidad ?? "").toLowerCase()) {
    case "critica":
    case "alta":
      return "critica";
    case "media":
      return "atencion";
    default:
      return "info";
  }
}

type TierMeta = {
  /** token base del tier — usado para strip, borde, texto de acento */
  accentVar: string;
  bgVar: string;
  borderVar: string;
  /** título de la sección */
  label: string;
  /** subtítulo / matiz */
  hint: string;
};

const TIER_META: Record<Tier, TierMeta> = {
  critica: {
    accentVar: "--neg",
    bgVar: "--neg-bg",
    borderVar: "--neg-border",
    label: "Críticas",
    hint: "Requieren acción inmediata",
  },
  atencion: {
    accentVar: "--warn",
    bgVar: "--warn-bg",
    borderVar: "--warn-border",
    label: "Atención",
    hint: "Revisar en el día",
  },
  info: {
    accentVar: "--info",
    bgVar: "--info-bg",
    borderVar: "--info-border",
    label: "Informativas",
    hint: "Seguimiento",
  },
};

/**
 * Tipo de alerta como identificador canónico. Lo mostramos tal cual lo emite el
 * motor de riesgo (snake_case) — es la clave estable que el equipo reconoce y
 * busca; no la disfrazamos con title-case.
 */
function tipoLabel(tipo: string | null | undefined): string {
  return tipo || "alerta";
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function AlertGlyph({ tier, className }: { tier: Tier; className?: string }) {
  if (tier === "critica") {
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
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  }
  if (tier === "atencion") {
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
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    );
  }
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

// ─── Sección por tier ─────────────────────────────────────────────────────────

function SeverityHeader({ tier, count }: { tier: Tier; count: number }) {
  const meta = TIER_META[tier];
  const isDominant = tier === "critica";

  return (
    <div className="mb-3 flex items-center gap-3">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: `hsl(var(${meta.accentVar}))` }}
        aria-hidden="true"
      />
      <h2
        className={
          isDominant
            ? "text-sm font-bold uppercase tracking-[0.14em] text-text"
            : "text-xs font-semibold uppercase tracking-[0.14em] text-text-muted"
        }
      >
        {meta.label}
      </h2>
      <span
        className={`grid place-items-center rounded-full font-semibold ${isDominant ? "h-7 min-w-7 px-2 text-sm" : "h-5 min-w-5 px-1.5 text-xs"}`}
        style={{
          background: `hsl(var(${meta.bgVar}))`,
          color: `hsl(var(${meta.accentVar}))`,
          boxShadow: `inset 0 0 0 1px hsl(var(${meta.borderVar}))`,
          ...MONO,
        }}
        aria-label={`${count} alertas`}
      >
        {count}
      </span>
      <span
        className="text-[10px] font-medium uppercase tracking-[0.18em]"
        style={{ color: isDominant ? `hsl(var(${meta.accentVar}))` : "hsl(var(--text-subtle))" }}
      >
        {meta.hint}
      </span>
      <span
        className="ml-auto h-px w-12 sm:w-24"
        style={{ background: "hsl(var(--border))" }}
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Tarjeta de alerta ────────────────────────────────────────────────────────

function AlertaCard({
  alerta,
  tier,
  resolviendo,
  justificacion,
  isResolverPending,
  onStartResolver,
  onCancelResolver,
  onJustificacionChange,
  onConfirmResolver,
  onAsignar,
  onOpenPrestamo,
}: {
  alerta: Alerta;
  tier: Tier;
  resolviendo: boolean;
  justificacion: string;
  isResolverPending: boolean;
  onStartResolver: () => void;
  onCancelResolver: () => void;
  onJustificacionChange: (v: string) => void;
  onConfirmResolver: () => void;
  onAsignar: () => void;
  onOpenPrestamo: () => void;
}) {
  const meta = TIER_META[tier];
  const isDominant = tier === "critica";

  return (
    <article
      className="group relative overflow-hidden rounded-xl border transition-all duration-150 hover:-translate-y-0.5"
      style={{
        background: "hsl(var(--surface))",
        borderColor: isDominant ? `hsl(var(${meta.borderVar}))` : "hsl(var(--border))",
        boxShadow: "var(--shadow-sm)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.borderColor = `hsl(var(${meta.borderVar}))`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        e.currentTarget.style.borderColor = isDominant
          ? `hsl(var(${meta.borderVar}))`
          : "hsl(var(--border))";
      }}
    >
      {/* Strip de severidad de 4px a la izquierda */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: `hsl(var(${meta.accentVar}))` }}
        aria-hidden="true"
      />

      <div className={`flex flex-col gap-3 pl-5 pr-4 ${isDominant ? "py-4" : "py-3.5"}`}>
        <div className="flex items-start gap-3">
          {/* Glifo de severidad */}
          <span
            className={`grid shrink-0 place-items-center rounded-lg ${isDominant ? "h-10 w-10" : "h-9 w-9"}`}
            style={{ background: `hsl(var(${meta.bgVar}))`, color: `hsl(var(${meta.accentVar}))` }}
            aria-hidden="true"
          >
            <AlertGlyph tier={tier} className={isDominant ? "h-5 w-5" : "h-4 w-4"} />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`truncate font-semibold leading-tight text-text ${isDominant ? "text-[0.9375rem]" : "text-sm"}`}
                style={MONO}
              >
                {tipoLabel(alerta.tipo)}
              </span>
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: `hsl(var(${meta.bgVar}))`,
                  color: `hsl(var(${meta.accentVar}))`,
                }}
              >
                {alerta.severidad ?? "—"}
              </span>
            </div>

            {/* Métrica + valor + préstamo afectado */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              {alerta.metrica && (
                <span className="inline-flex items-baseline gap-1">
                  <span className="text-text-subtle">{alerta.metrica}</span>
                  <span className="font-semibold text-text" style={MONO}>
                    {alerta.valor ?? "—"}
                  </span>
                </span>
              )}
              {alerta.prestamo_id && (
                <button
                  type="button"
                  onClick={onOpenPrestamo}
                  className="inline-flex items-center gap-1 rounded text-text-muted transition-colors duration-150 hover:text-brand focus:outline-none focus-visible:text-brand"
                >
                  <LinkIcon className="h-3 w-3" />
                  <span style={MONO}>{(alerta.prestamo_id || "").slice(0, 8).toUpperCase()}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Acciones / formulario de resolución */}
        {resolviendo ? (
          <div
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            style={{ paddingLeft: isDominant ? "3.25rem" : "3rem" }}
          >
            <FormField
              label="Justificación"
              name="justificacion"
              className="flex-1"
              value={justificacion}
              onChange={(e) => onJustificacionChange(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onConfirmResolver}
                disabled={!justificacion || isResolverPending}
              >
                Confirmar resolución
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelResolver}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2" style={{ paddingLeft: isDominant ? "3.25rem" : "3rem" }}>
            <Button size="sm" variant="outline" onClick={onStartResolver} className="gap-1.5">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              Resolver
            </Button>
            <Button size="sm" variant="outline" onClick={onAsignar}>
              Asignar
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Estados ──────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div
      data-testid="alertas-loading"
      className="space-y-6"
      aria-busy="true"
      aria-label="Cargando alertas"
    >
      {[3, 2].map((n, gi) => (
        <div key={gi} className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="h-2 w-2 animate-pulse rounded-full"
              style={{ background: "hsl(var(--border-strong))" }}
            />
            <div
              className="h-3 w-24 animate-pulse rounded"
              style={{ background: "hsl(var(--surface-sunken))" }}
            />
            <div
              className="h-6 w-6 animate-pulse rounded-full"
              style={{ background: "hsl(var(--surface-sunken))" }}
            />
          </div>
          {Array.from({ length: n }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl"
              style={{
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${(gi * 3 + i) * 70}ms`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed py-16 text-center"
      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--surface-sunken))" }}
    >
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl"
        style={{
          background: "hsl(var(--pos-bg))",
          color: "hsl(var(--pos))",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <CheckCircleIcon className="h-7 w-7" />
      </span>
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-text">No hay alertas activas</p>
        <p className="mt-1 text-xs leading-relaxed text-text-subtle">
          La cartera no tiene alertas de riesgo abiertas. Cuando el motor detecte una, va a aparecer
          acá ordenada por severidad.
        </p>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

/** Gestión de alertas: resolver (con justificación) y asignar (crea tarea). */
export function AlertasPage() {
  const q = useAlertas();
  const resolver = useResolverAlerta();
  const asignar = useAsignarAlerta();
  const navigate = useNavigate();
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const activas = useMemo(
    () => (q.data?.data ?? []).filter((a) => a.estado === "activa"),
    [q.data],
  );

  const grupos = useMemo(() => {
    const acc: Record<Tier, Alerta[]> = { critica: [], atencion: [], info: [] };
    for (const a of activas) acc[tierOf(a.severidad)].push(a);
    return acc;
  }, [activas]);

  if (q.isLoading) return <LoadingState />;
  if (q.isError)
    return (
      <p role="alert" className="p-4 text-sm" style={{ color: "hsl(var(--neg))" }}>
        No se pudieron cargar las alertas.
      </p>
    );

  const total = activas.length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight text-text"
            style={{ letterSpacing: "-0.02em" }}
          >
            Alertas
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Señales de riesgo abiertas, ordenadas por severidad.
          </p>
        </div>
        {total > 0 && (
          <span
            className="mt-1 inline-flex items-baseline gap-1.5 rounded-xl border px-3 py-1.5"
            style={{
              borderColor: "hsl(var(--border))",
              background: "hsl(var(--surface))",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <span className="text-lg font-bold text-text" style={MONO}>
              {total}
            </span>
            <span className="text-xs text-text-muted">activas</span>
          </span>
        )}
      </header>

      {aviso && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm"
          style={{
            borderColor: "hsl(var(--pos-border))",
            background: "hsl(var(--pos-bg))",
            color: "hsl(var(--pos))",
          }}
        >
          <CheckCircleIcon className="h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {total === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-7">
          {TIER_ORDER.map((tier) => {
            const items = grupos[tier];
            if (items.length === 0) return null;
            const meta = TIER_META[tier];
            const isDominant = tier === "critica";

            return (
              <section key={tier} aria-label={`Alertas ${meta.label}`}>
                <SeverityHeader tier={tier} count={items.length} />
                <div
                  className={isDominant ? "rounded-2xl p-3" : ""}
                  style={
                    isDominant
                      ? {
                          background: `hsl(var(${meta.bgVar}) / 0.35)`,
                          boxShadow: `inset 0 0 0 1px hsl(var(${meta.borderVar}) / 0.6)`,
                        }
                      : undefined
                  }
                >
                  <div className="space-y-3">
                    {items.map((a) => (
                      <AlertaCard
                        key={a.id}
                        alerta={a}
                        tier={tier}
                        resolviendo={resolviendo === a.id}
                        justificacion={justificacion}
                        isResolverPending={resolver.isPending}
                        onStartResolver={() => {
                          setResolviendo(a.id);
                          setJustificacion("");
                        }}
                        onCancelResolver={() => {
                          setResolviendo(null);
                          setJustificacion("");
                        }}
                        onJustificacionChange={setJustificacion}
                        onConfirmResolver={async () => {
                          await resolver.mutateAsync({ id: a.id, justificacion });
                          setResolviendo(null);
                          setJustificacion("");
                          setAviso("Alerta resuelta.");
                        }}
                        onAsignar={async () => {
                          await asignar.mutateAsync({ id: a.id, operadorId: "user-operador" });
                          setAviso("Tarea creada y alerta asignada.");
                        }}
                        onOpenPrestamo={() =>
                          a.prestamo_id && navigate({ to: `/prestamos/${a.prestamo_id}` as string })
                        }
                      />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
