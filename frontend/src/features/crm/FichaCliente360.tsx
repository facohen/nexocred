import { useState } from "react";
import { MoneyText } from "@/components/MoneyText";
import { useFicha360, useTimeline } from "./hooks";
import { InteraccionForm } from "./InteraccionForm";

// ─── Risk bucket helpers ──────────────────────────────────────────────────────

type RiskBucket = "0" | "30" | "60" | "90" | "castigo";

function getRiskBucket(dias: number): RiskBucket {
  if (dias === 0) return "0";
  if (dias <= 30) return "30";
  if (dias <= 60) return "60";
  if (dias <= 90) return "90";
  return "castigo";
}

// Tailwind class maps — using the token system from tailwind.config.ts
const RISK_HERO_BG: Record<RiskBucket, string> = {
  "0": "bg-risk-0/10 border-risk-0/30",
  "30": "bg-risk-30/10 border-risk-30/30",
  "60": "bg-risk-60/12 border-risk-60/30",
  "90": "bg-risk-90/12 border-risk-90/30",
  castigo: "bg-risk-castigo/15 border-risk-castigo/30",
};

const RISK_ACCENT_BAR: Record<RiskBucket, string> = {
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

const RISK_BADGE_BG: Record<RiskBucket, string> = {
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

// ─── Timeline dot color by event type ────────────────────────────────────────

const TIMELINE_DOT: Record<string, string> = {
  interaccion: "bg-info border-info/40",
  credito: "bg-pos border-pos/40",
  incidente: "bg-neg border-neg/40",
  novacion: "bg-warn border-warn/40",
};

const TIMELINE_TYPE_BADGE: Record<string, string> = {
  interaccion: "bg-info/10 text-info border-info/25",
  credito: "bg-pos/10 text-pos border-pos/25",
  incidente: "bg-neg/10 text-neg border-neg/25",
  novacion: "bg-warn/10 text-warn border-warn/25",
};

// ─── Typographic avatar ───────────────────────────────────────────────────────

function Avatar({ personaId }: { personaId: string }) {
  const letters =
    personaId
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 2)
      .toUpperCase() || "CL";
  return (
    <div
      aria-hidden="true"
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-subtle border border-brand/20 shadow-xs"
    >
      <span
        className="font-num text-lg font-semibold tracking-tight text-brand"
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        {letters}
      </span>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function FichaLoading() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      role="status"
      aria-label="Cargando ficha del cliente"
    >
      {/* Hero skeleton — mirrors avatar | ID+badge row | dias block */}
      <div className="relative border-b border-border bg-surface-sunken/40 px-6 py-5">
        {/* left accent bar ghost */}
        <div className="absolute inset-y-0 left-0 w-1 animate-pulse bg-surface-sunken" />
        <div className="flex items-start gap-4 pl-3">
          {/* avatar circle */}
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-surface-sunken" />
          {/* identity block */}
          <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
            <div className="min-w-0 space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-20 animate-pulse rounded bg-surface-sunken" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-surface-sunken" />
              </div>
              <div className="h-3 w-36 animate-pulse rounded bg-surface-sunken" />
            </div>
            {/* dias block */}
            <div className="hidden shrink-0 sm:block space-y-1 text-right">
              <div className="h-8 w-12 animate-pulse rounded bg-surface-sunken" />
              <div className="h-2.5 w-16 animate-pulse rounded bg-surface-sunken" />
            </div>
          </div>
        </div>
      </div>

      {/* Body skeleton — mirrors 42/58 asymmetric split */}
      <div className="flex flex-col sm:flex-row">
        {/* LEFT: large mono number ghost */}
        <div className="flex flex-col justify-center gap-2 border-b border-border px-6 py-5 sm:w-[42%] sm:border-b-0 sm:border-r">
          <div className="h-3 w-24 animate-pulse rounded bg-surface-sunken" />
          <div className="h-9 w-40 animate-pulse rounded bg-surface-sunken" />
          <div className="h-3 w-48 animate-pulse rounded bg-surface-sunken" />
        </div>
        {/* RIGHT: 2-pill grid + bar */}
        <div className="flex flex-1 flex-col justify-center gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-1.5">
              <div className="h-2.5 w-20 animate-pulse rounded bg-surface-sunken" />
              <div className="h-5 w-10 animate-pulse rounded bg-surface-sunken" />
            </div>
            <div className="space-y-1.5">
              <div className="h-2.5 w-20 animate-pulse rounded bg-surface-sunken" />
              <div className="h-5 w-16 animate-pulse rounded bg-surface-sunken" />
            </div>
          </div>
          <div className="border-t border-border pt-4 space-y-1.5">
            <div className="flex justify-between">
              <div className="h-2.5 w-28 animate-pulse rounded bg-surface-sunken" />
              <div className="h-2.5 w-6 animate-pulse rounded bg-surface-sunken" />
            </div>
            <div className="h-1.5 w-full animate-pulse rounded-full bg-surface-sunken" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI pill with directionality ─────────────────────────────────────────────

type KpiIntent = "neutral" | "pos" | "warn" | "neg";

function KpiPill({
  label,
  value,
  intent = "neutral",
  bar,
  barMax,
  children,
}: {
  label: string;
  value?: string | number;
  intent?: KpiIntent;
  /** If provided, renders a mini horizontal bar below the value */
  bar?: number;
  barMax?: number;
  children?: React.ReactNode;
}) {
  const intentTextClass: Record<KpiIntent, string> = {
    neutral: "text-text",
    pos: "text-pos",
    warn: "text-warn",
    neg: "text-neg",
  };
  const intentBarClass: Record<KpiIntent, string> = {
    neutral: "bg-brand",
    pos: "bg-pos",
    warn: "bg-warn",
    neg: "bg-neg",
  };

  const displayValue = value !== undefined ? value : children;
  const barPct =
    bar !== undefined && barMax !== undefined && barMax > 0
      ? Math.min((bar / barMax) * 100, 100)
      : null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      <span
        className={`font-num text-base font-semibold tabular-nums leading-none ${intentTextClass[intent]}`}
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        {displayValue}
      </span>
      {/* Inline mini-bar for directionality */}
      {barPct !== null && (
        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${intentBarClass[intent]}`}
            style={{ width: `${barPct}%` }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

// ─── Promesas progress bar ────────────────────────────────────────────────────

function PromesasBar({ vigentes }: { vigentes: number }) {
  const MAX_VISUAL = 5;
  const pct = Math.min((vigentes / MAX_VISUAL) * 100, 100);
  const hasPromesas = vigentes > 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
          Promesas vigentes
        </span>
        <span
          className="font-num text-base font-semibold tabular-nums text-text"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          {vigentes}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${hasPromesas ? "bg-warn" : "bg-border-strong"}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={vigentes}
          aria-valuemin={0}
          aria-valuemax={MAX_VISUAL}
          aria-label={`${vigentes} promesas vigentes`}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Ficha consolidada del cliente a nivel persona:
 * exposición total, peor bucket de mora, préstamos activos, promesas vigentes,
 * más el timeline histórico. Reutilizable en CRM, gestión de cobranza, etc.
 */
export function FichaCliente360({ personaId }: { personaId: string }) {
  const fichaQ = useFicha360(personaId);

  if (fichaQ.isLoading) {
    return <FichaLoading />;
  }

  if (fichaQ.isError || !fichaQ.data) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-neg-border bg-neg-bg p-4 text-sm text-neg"
      >
        <span aria-hidden="true" className="mt-0.5 text-base leading-none">
          ⚠
        </span>
        <span>No se pudo cargar la ficha del cliente.</span>
      </div>
    );
  }

  const f = fichaQ.data;
  const bucket = getRiskBucket(f.peor_bucket_dias);

  // Determine KPI intent for prestamos_activos:
  // treat 0 as neutral, 1–3 as pos, 4+ as warn
  const prestamosIntent: KpiIntent =
    f.prestamos_activos === 0 ? "neutral" : f.prestamos_activos <= 3 ? "pos" : "warn";
  // Portfolio max cap for the mini-bar (visual scale)
  const PRESTAMOS_MAX = 6;

  return (
    <div className="space-y-4">
      {/* ── Card principal ───────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {/* ── Hero band: risk-colored header ───────────────────── */}
        <div className={`relative border-b ${RISK_HERO_BG[bucket]} px-6 py-5`}>
          {/* Left accent bar */}
          <div
            className={`absolute inset-y-0 left-0 w-1 ${RISK_ACCENT_BAR[bucket]}`}
            aria-hidden="true"
          />

          <div className="flex items-start gap-4 pl-3">
            <Avatar personaId={personaId} />

            <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
              {/* Identity block */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-num text-xs font-medium tracking-widest text-text-muted"
                    style={{ fontFamily: "'Geist Mono', monospace" }}
                  >
                    #{personaId.slice(0, 8).toUpperCase()}
                  </span>
                  {/* Risk bucket badge */}
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${RISK_BADGE_BG[bucket]}`}
                  >
                    {RISK_LABEL[bucket]}
                    {f.peor_bucket_dias > 0 && (
                      <span className="ml-1 opacity-70">· {f.peor_bucket_dias}d</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-text-subtle">
                  Cliente · ID completo disponible en perfil
                </div>
              </div>

              {/* Mora indicator — shown only when in arrears */}
              {f.peor_bucket_dias > 0 && (
                <div className={`hidden shrink-0 text-right sm:block ${RISK_TEXT[bucket]}`}>
                  <div
                    className="font-num text-2xl font-bold tabular-nums leading-none"
                    style={{ fontFamily: "'Geist Mono', monospace" }}
                  >
                    {f.peor_bucket_dias}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider opacity-75">
                    días mora
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Asymmetric body: large metric left, KPI cluster right ── */}
        <div className="flex flex-col gap-0 sm:flex-row">
          {/* LEFT: large exposure metric (~42% on desktop) — no left padding so number bleeds to the divider */}
          <div className="flex flex-col justify-center gap-1 border-b border-border py-5 pr-6 pl-6 sm:w-[42%] sm:border-b-0 sm:border-r sm:pl-6 sm:pr-0">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
              Exposición total
            </span>
            {/* Number bleeds toward the border-r divider — editorial tension */}
            <MoneyText
              value={f.exposicion_total}
              className="font-num text-3xl font-bold leading-none tracking-tight text-text"
            />
            <span className="mt-1 text-[11px] text-text-subtle">
              Saldo consolidado de préstamos activos
            </span>
          </div>

          {/* RIGHT: compact KPI cluster */}
          <div className="flex flex-1 flex-col justify-center gap-4 px-6 py-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* Préstamos activos — with mini-bar for directionality */}
              <KpiPill
                label="Préstamos activos"
                value={f.prestamos_activos}
                intent={prestamosIntent}
                bar={f.prestamos_activos}
                barMax={PRESTAMOS_MAX}
              />

              {/* Bucket mora — risk-colored value for directionality */}
              <KpiPill label="Bucket mora" intent="neutral">
                <span className={RISK_TEXT[bucket]}>{RISK_LABEL[bucket]}</span>
              </KpiPill>
            </div>

            {/* Promesas vigentes with progress bar */}
            <div className="border-t border-border pt-4">
              <PromesasBar vigentes={f.promesas_vigentes} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <StyledTimelineWrapper personaId={personaId} />
    </div>
  );
}

// ─── Premium timeline wrapper ─────────────────────────────────────────────────
// Wraps TimelinePanel with premium visual shell. TimelinePanel internal logic
// is preserved unchanged — this component only provides the container chrome.

function StyledTimelineWrapper({ personaId }: { personaId: string }) {
  const q = useTimeline(personaId);
  const [mostrarForm, setMostrarForm] = useState(false);

  if (q.isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <div className="h-4 w-32 animate-pulse rounded-md bg-surface-sunken" />
        </div>
        <div className="space-y-3 px-6 py-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface-sunken" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-surface-sunken" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-neg-border bg-neg-bg p-4 text-sm text-neg"
      >
        <span aria-hidden="true" className="mt-0.5 leading-none">
          ⚠
        </span>
        <span>No se pudo cargar el timeline.</span>
      </div>
    );
  }

  const eventos = [...(q.data?.data ?? [])].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text">Timeline 360</h3>
          {eventos.length > 0 && (
            <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[11px] font-semibold text-brand">
              {eventos.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMostrarForm((v) => !v)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:bg-surface-sunken hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {mostrarForm ? "Cancelar" : "+ Nueva interacción"}
        </button>
      </div>

      {/* Timeline body */}
      <div className="px-6 py-5">
        {eventos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
              <span className="text-lg text-text-subtle" aria-hidden="true">
                ○
              </span>
            </div>
            <p className="text-sm text-text-muted">Sin actividad registrada</p>
            <p className="text-xs text-text-subtle">Las interacciones aparecerán aquí</p>
          </div>
        ) : (
          <ol className="relative space-y-0">
            {eventos.map((e, idx) => {
              const tipo = e.tipo ?? "interaccion";
              const dotClass = TIMELINE_DOT[tipo] ?? "bg-info border-info/40";
              const badgeClass = TIMELINE_TYPE_BADGE[tipo] ?? "bg-info/10 text-info border-info/25";
              const isLast = idx === eventos.length - 1;

              return (
                <li
                  key={idx}
                  data-testid="timeline-evento"
                  className="relative flex gap-4 pb-5 last:pb-0"
                >
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div
                      aria-hidden="true"
                      className="absolute left-[5px] top-3 bottom-0 w-px bg-border"
                    />
                  )}

                  {/* Dot */}
                  <div
                    aria-hidden="true"
                    className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${dotClass}`}
                  />

                  {/* Content */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
                      >
                        {tipo}
                      </span>
                      <span className="text-sm text-text">{e.detalle ?? tipo}</span>
                    </div>
                    <time dateTime={e.fecha} className="mt-0.5 block text-[11px] text-text-subtle">
                      {new Date(e.fecha).toLocaleString("es-AR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Inline interaction form */}
      {mostrarForm && (
        <div className="border-t border-border px-6 py-5">
          <InteraccionForm personaId={personaId} onCreated={() => setMostrarForm(false)} />
        </div>
      )}
    </div>
  );
}
