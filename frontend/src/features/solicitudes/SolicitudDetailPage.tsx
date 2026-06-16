import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useSolicitud, useChecklist, useAccionSolicitud } from "@/lib/api/queries";
import { newIdempotencyKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { MoneyText } from "@/components/MoneyText";
import { ApiError } from "@/lib/api/client";
import { useSession, hasRole } from "@/lib/auth";
import type { ChecklistFila } from "@/lib/api/queries";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// ─── Estado model (compartido con la lista) ───────────────────────────────────
// El acento del estado se propaga por todo el header: aprobada=pos, rechazada=neg,
// pendiente/ingresada=warn, en evaluación=brand.

type Tone = "warn" | "brand" | "pos" | "neg" | "info";

const ESTADO_TONE: Record<string, { tone: Tone; label: string }> = {
  ingresada: { tone: "warn", label: "Ingresada" },
  en_evaluacion: { tone: "brand", label: "En evaluación" },
  evaluada: { tone: "brand", label: "Evaluada" },
  aprobada: { tone: "pos", label: "Aprobada" },
  desembolsada: { tone: "pos", label: "Desembolsada" },
  rechazada: { tone: "neg", label: "Rechazada" },
};

function estadoMeta(estado: string | undefined): { tone: Tone; label: string } {
  if (!estado) return { tone: "info", label: "—" };
  return ESTADO_TONE[estado] ?? { tone: "info", label: estado };
}

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function initialsFromId(id: string | undefined): string {
  if (!id) return "··";
  const clean = id.replace(/[^a-zA-Z0-9]/g, "");
  return (clean.slice(0, 2) || "··").toUpperCase();
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
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
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        background: `hsl(var(--${tone}-bg))`,
        color: `hsl(var(--${tone}))`,
        border: `1px solid hsl(var(--${tone}-border))`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: `hsl(var(--${tone}))` }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// ─── Score gauge ──────────────────────────────────────────────────────────────
// Score 0–1000 mapeado a un arco. El color del valor lo conduce el score:
// bajo = neg, medio = warn, alto = pos. El número va en Geist Mono.

function scoreTone(score: number): Tone {
  if (score >= 700) return "pos";
  if (score >= 500) return "warn";
  return "neg";
}

function ScoreGauge({ score }: { score: number | null | undefined }) {
  const value = score ?? null;
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / 1000));
  const tone = value == null ? "info" : scoreTone(value);

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(hsl(var(--${tone})) ${pct * 360}deg, hsl(var(--surface-sunken)) ${pct * 360}deg)`,
        }}
        role="img"
        aria-label={value == null ? "Sin score" : `Score ${value} de 1000`}
      >
        <div
          className="grid place-items-center rounded-full bg-surface"
          style={{ height: "4.25rem", width: "4.25rem" }}
        >
          <span className="text-2xl font-bold" style={{ ...MONO, color: `hsl(var(--${tone}))` }}>
            {value ?? "—"}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-text-subtle">
          Score crediticio
        </p>
        <p className="mt-0.5 text-sm font-medium text-text">
          <span style={{ ...MONO, color: `hsl(var(--${tone}))` }}>{value ?? "—"}</span>
          <span className="text-text-subtle" style={MONO}>
            {" "}
            / 1000
          </span>
        </p>
        <p className="mt-1 text-sm leading-snug text-text-muted">
          {value == null
            ? "Aún sin evaluar. Corré la evaluación para obtener el puntaje."
            : value >= 700
              ? "Perfil sólido — dentro de política."
              : value >= 500
                ? "Perfil medio — revisar checklist."
                : "Perfil de riesgo elevado."}
        </p>
      </div>
    </div>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────────────

function MetricTile({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${span ? "col-span-2" : ""}`}
    >
      <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-text-subtle">
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// ─── Checklist row ────────────────────────────────────────────────────────────

function ChecklistItem({ item }: { item: ChecklistFila }) {
  const tone: Tone = item.ok ? "pos" : "neg";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
        style={{
          background: `hsl(var(--${tone}-bg))`,
          color: `hsl(var(--${tone}))`,
          border: `1px solid hsl(var(--${tone}-border))`,
        }}
        aria-hidden="true"
      >
        {item.ok ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{item.etiqueta}</span>
      <span className="shrink-0 text-xs font-medium" style={{ color: `hsl(var(--${tone}))` }}>
        {item.detalle}
      </span>
    </li>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SolicitudDetailPage() {
  const { solicitudId } = useParams({ strict: false }) as { solicitudId: string };
  const { user } = useSession();
  // El vendedor ve la solicitud en modo lectura: evaluar/simular/aprobar son
  // acciones del analista de riesgo, no del vendedor que la originó.
  const puedeAccionar = hasRole(user, "analista_riesgo");
  const { data: solicitud } = useSolicitud(solicitudId);
  const { data: checklistData, isSuccess: checklistListo } = useChecklist(solicitudId);
  const accion = useAccionSolicitud(solicitudId);
  // Stable key per (solicitud) disbursement intent: a double-click / re-submit
  // reuses the same Idempotency-Key so the backend dedupes the disbursement.
  // solicitudId es dependencia DELIBERADA: regenera la key al cambiar de solicitud.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const desembolsoKey = useMemo(() => newIdempotencyKey(), [solicitudId]);

  const checklist = checklistData?.checklist ?? [];
  const bcraItem = checklist.find((c) => c.regla === "bcra");
  // Fail-safe: si la regla bcra no llegó o es desconocida, se considera
  // bloqueante (no se puede aprobar sin confirmar BCRA).
  const bcraBlocked = !bcraItem || !bcraItem.ok;
  const algunaFalla = checklist.some((c) => !c.ok);
  // Aprobar sólo cuando el checklist cargó Y no hay políticas en falla Y BCRA OK.
  const aprobarDeshabilitado = accion.isPending || !checklistListo || algunaFalla || bcraBlocked;
  const accionError =
    accion.error instanceof ApiError
      ? accion.error.message
      : accion.error
        ? "No se pudo completar la acción"
        : null;

  const meta = estadoMeta(solicitud?.estado);
  const fallasCount = checklist.filter((c) => !c.ok).length;
  const avatarInitials = initialsFromId(solicitud?.persona_id ?? solicitudId);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* ── Hero asimétrico: monto domina; el acento del estado tiñe la banda ── */}
      <header className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {/* status-driven left accent strip */}
        <span
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: `hsl(var(--${meta.tone}))` }}
          aria-hidden="true"
        />
        {/* status-tinted band — propaga el color del estado por todo el header */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(110deg, hsl(var(--${meta.tone}) / 0.07) 0%, hsl(var(--${meta.tone}) / 0.02) 42%, transparent 70%)`,
          }}
          aria-hidden="true"
        />
        {/* soft status wash behind the monto */}
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
          style={{ background: `hsl(var(--${meta.tone}) / 0.12)` }}
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-7 p-7 pl-8 sm:flex-row sm:items-end sm:justify-between">
          {/* Left: avatar grande + id + el monto dominante */}
          <div className="flex min-w-0 items-start gap-4">
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
              style={{
                background: "hsl(var(--brand-subtle))",
                color: "hsl(var(--brand))",
                border: `1.5px solid hsl(var(--${meta.tone}) / 0.28)`,
                ...MONO,
              }}
              aria-hidden="true"
            >
              {avatarInitials}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-base font-bold tracking-tight text-text">Solicitud</h1>
                <span className="text-sm font-semibold tracking-tight text-text-muted" style={MONO}>
                  #{shortId(solicitudId)}
                </span>
                <StatusBadge tone={meta.tone} label={meta.label} />
              </div>

              {/* Monto hero — el número más grande de la pantalla */}
              <p
                className="mt-3 text-4xl font-bold leading-none tracking-tight"
                style={{ letterSpacing: "-0.02em" }}
              >
                <MoneyText value={solicitud?.monto ?? null} className="text-4xl leading-none" />
              </p>

              {solicitud?.cantidad_cuotas != null ? (
                <p className="mt-2.5 text-sm text-text-muted">
                  en <span style={MONO}>{solicitud.cantidad_cuotas}</span> cuotas
                  {solicitud.tasa_resuelta != null ? (
                    <>
                      {" · tasa "}
                      <span style={MONO}>{solicitud.tasa_resuelta}</span>
                    </>
                  ) : null}
                  {solicitud.persona_id ? (
                    <>
                      {" · cliente "}
                      <span style={MONO}>{shortId(solicitud.persona_id)}</span>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-2.5 text-sm text-text-subtle">Sin plan de cuotas definido</p>
              )}
            </div>
          </div>

          {/* Decision cluster — peso visual desde el acento del estado */}
          {puedeAccionar && (
            <div className="flex shrink-0 flex-col gap-2.5 sm:items-end">
              <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-text-subtle">
                Decisión
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => accion.mutate({ accion: "evaluar" })}
                  disabled={accion.isPending}
                >
                  Evaluar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => accion.mutate({ accion: "simular" })}
                  disabled={accion.isPending}
                >
                  Simular
                </Button>
              </div>
              <TransactionButton
                className="gap-2 bg-pos text-white shadow-sm hover:opacity-90"
                onClick={() =>
                  accion.mutate({ accion: "desembolsar", idempotencyKey: desembolsoKey })
                }
                disabled={aprobarDeshabilitado}
                pending={accion.isPending}
                title={
                  !checklistListo
                    ? "Validando políticas…"
                    : bcraBlocked
                      ? "Bloqueado: situación BCRA pendiente o vencida"
                      : undefined
                }
              >
                <CheckIcon className="h-4 w-4" />
                Aprobar y desembolsar
              </TransactionButton>
            </div>
          )}
        </div>
      </header>

      {/* ── Alerts ── */}
      {accionError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border p-4 text-sm"
          style={{
            borderColor: "hsl(var(--neg-border))",
            background: "hsl(var(--neg-bg))",
            color: "hsl(var(--neg))",
          }}
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{accionError}</span>
        </div>
      )}

      {checklistListo && bcraBlocked && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border p-4 text-sm"
          style={{
            borderColor: "hsl(var(--neg-border))",
            background: "hsl(var(--neg-bg))",
            color: "hsl(var(--neg))",
          }}
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            La verificación BCRA está pendiente o vencida. No se puede aprobar la solicitud hasta
            resolverla.
          </span>
        </div>
      )}

      {/* ── Body asimétrico: score + métricas (izq, ancho) / checklist (der) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Score + financials — dominante */}
        <section className="flex flex-col gap-5 lg:col-span-3">
          <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-sm">
            <ScoreGauge score={solicitud?.score} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricTile label="Monto solicitado">
              <MoneyText value={solicitud?.monto ?? null} className="text-base font-semibold" />
            </MetricTile>
            <MetricTile label="Cuotas">
              <span className="text-base font-semibold text-text" style={MONO}>
                {solicitud?.cantidad_cuotas ?? "—"}
              </span>
            </MetricTile>
            <MetricTile label="Tasa resuelta">
              <span className="text-base font-semibold text-text" style={MONO}>
                {solicitud?.tasa_resuelta ?? "—"}
              </span>
            </MetricTile>
            <MetricTile label="Políticas en falla">
              <span
                className="text-base font-semibold"
                style={{
                  ...MONO,
                  color: fallasCount > 0 ? "hsl(var(--neg))" : "hsl(var(--pos))",
                }}
              >
                {checklistListo ? fallasCount : "—"}
              </span>
            </MetricTile>
            {solicitud?.motivo_rechazo ? (
              <MetricTile label="Motivo de rechazo" span>
                <span className="text-sm font-medium" style={{ color: "hsl(var(--neg))" }}>
                  {solicitud.motivo_rechazo}
                </span>
              </MetricTile>
            ) : null}
          </div>
        </section>

        {/* Checklist — columna compañera */}
        <section className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-text">Checklist de políticas</h2>
              {checklistListo && (
                <StatusBadge
                  tone={algunaFalla ? "neg" : "pos"}
                  label={algunaFalla ? `${fallasCount} en falla` : "Todo OK"}
                />
              )}
            </div>
            <div className="px-5 py-1">
              {checklist.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">
                  {checklistListo
                    ? "Sin reglas para evaluar."
                    : "Cargando validación de políticas…"}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {checklist.map((c) => (
                    <ChecklistItem key={c.regla} item={c} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
