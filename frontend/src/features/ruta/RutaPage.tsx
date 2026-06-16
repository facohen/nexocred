import { useEffect, useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { MoneyText } from "@/components/MoneyText";
import { addMoney, compareMoney } from "@/lib/money";
import { useCajas } from "@/lib/api/queries";
import { useParadas } from "./hooks";
import type { components } from "@/lib/api/schema";

type Parada = components["schemas"]["ParadaConSaldoOut"];
import { useRutaSync } from "./useOnline";
import { encolarVisita, contarPendientes, type VisitaEncolada } from "./queue";
import { VisitaCaptureForm } from "./VisitaCaptureForm";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

/* ── Priority model ───────────────────────────────────────────────────────────
 * Each unvisited stop gets a priority tier derived from its exigible saldo
 * (no extra fields exist on ParadaConSaldoOut). Larger debts read as "vencido"
 * and dominate the list; visited stops drop to the bottom, muted. The tier
 * drives the 4px left strip color, the risk dot and the avatar tint. */

type Tier = "vencido" | "actual" | "futuro" | "hecho";

const TIER_VAR: Record<Tier, string> = {
  vencido: "--neg",
  actual: "--brand",
  futuro: "--text-subtle",
  hecho: "--pos",
};

const TIER_LABEL: Record<Tier, string> = {
  vencido: "Prioritario",
  actual: "A cobrar hoy",
  futuro: "Programado",
  hecho: "Completada",
};

const ALTO = "20000.00";
const MEDIO = "6000.00";

function tierFor(p: Parada): Tier {
  if (p.resultado != null) return "hecho";
  if (compareMoney(p.saldo_exigible ?? "0", ALTO) >= 0) return "vencido";
  if (compareMoney(p.saldo_exigible ?? "0", MEDIO) >= 0) return "actual";
  return "futuro";
}

/** Stable two-char "initials" from the loan id — typographic avatar, no photos. */
function avatarFor(p: Parada): string {
  const seed = p.prestamo_id ?? p.id ?? "";
  const hex = seed.replace(/[^0-9a-f]/gi, "");
  return (hex.slice(0, 2) || "··").toUpperCase();
}

const RESULTADO_TONE: Record<string, "success" | "warning" | "danger" | "default"> = {
  pago: "success",
  promesa: "warning",
  ausente: "default",
  rechazo: "danger",
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function PinIcon({ className }: { className?: string }) {
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
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
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
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function WifiOffIcon({ className }: { className?: string }) {
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
      <path d="M2 2l20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.8a15.6 15.6 0 0 1 4.7-2.6" />
      <path d="M21.9 8.8a15.7 15.7 0 0 0-5.1-3" />
      <path d="M5 12.9a10 10 0 0 1 2.7-1.6" />
      <path d="M19 12.9a10 10 0 0 0-3.4-1.8" />
      <line x1="12" y1="20" x2="12" y2="20" />
    </svg>
  );
}

function RouteIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M9 19h5a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h0" />
    </svg>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function StopSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" role="status">
      <span className="sr-only">Cargando ruta…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm"
        >
          <span
            className="absolute left-0 h-12 w-1 rounded-r"
            style={{ background: "hsl(var(--border))" }}
          />
          <div
            className="h-10 w-10 shrink-0 animate-pulse rounded-full"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 70}ms` }}
          />
          <div className="flex flex-1 flex-col gap-2">
            <div
              className="h-3.5 animate-pulse rounded"
              style={{
                width: `${40 + (i % 4) * 12}%`,
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${i * 70}ms`,
              }}
            />
            <div
              className="h-2.5 w-28 animate-pulse rounded"
              style={{
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${i * 70 + 40}ms`,
              }}
            />
          </div>
          <div
            className="h-4 w-16 animate-pulse rounded"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 70 + 20}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Progress / day header ────────────────────────────────────────────────────

function RutaHeader({ paradas }: { paradas: Parada[] }) {
  const r = useMemo(() => {
    const total = paradas.length;
    const hechas = paradas.filter((p) => p.resultado != null).length;
    const promesas = paradas.filter((p) => p.resultado === "promesa").length;
    const objetivo = paradas.reduce((acc, p) => addMoney(acc, p.saldo_exigible ?? "0"), "0");
    const cobrado = paradas.reduce((acc, p) => addMoney(acc, p.monto_cobrado ?? "0"), "0");
    const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
    return { total, hechas, promesas, objetivo, cobrado, pct };
  }, [paradas]);

  if (r.total === 0) return null;

  return (
    <section
      aria-label="Resumen del día"
      className="overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-sm"
    >
      {/* Hero band — cobrado del día is the dominant figure */}
      <div className="relative px-5 pt-5 pb-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ background: "hsl(var(--brand))" }}
          aria-hidden="true"
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-text-subtle">
              Recaudado hoy
            </span>
            <div className="mt-0.5 flex items-baseline gap-2">
              <MoneyText
                value={r.cobrado}
                intent="income"
                className="text-[2rem] font-bold leading-none tracking-tight"
              />
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              objetivo de la ruta <MoneyText value={r.objetivo} className="text-text" />
            </p>
          </div>
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "hsl(var(--brand) / 0.12)", color: "hsl(var(--brand))" }}
          >
            <RouteIcon className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Progress strip */}
      <div className="border-t border-border px-5 py-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-text-muted">Paradas completadas</span>
          <span className="text-text" style={MONO}>
            {`${r.hechas}/${r.total}`}
          </span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full"
          style={{ background: "hsl(var(--surface-sunken))" }}
          role="progressbar"
          aria-valuenow={r.pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${r.pct}%`,
              background: "hsl(var(--brand))",
            }}
          />
        </div>
        <div className="mt-2 flex items-center gap-3 text-[0.6875rem] text-text-subtle">
          <span style={MONO} className="text-text-muted">
            {r.pct}%
          </span>
          <span>·</span>
          <span>
            <span style={MONO} className="text-text-muted">
              {r.total - r.hechas}
            </span>{" "}
            pendiente{r.total - r.hechas === 1 ? "" : "s"}
          </span>
          {r.promesas > 0 && (
            <>
              <span>·</span>
              <span style={{ color: "hsl(var(--warn))" }}>
                <span style={MONO}>{r.promesas}</span> promesa{r.promesas === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Single stop card ─────────────────────────────────────────────────────────

function StopCard({
  parada,
  rutaId,
  capturando,
  onAbrir,
  onCerrar,
  onGuardar,
}: {
  parada: Parada;
  rutaId: string;
  capturando: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  onGuardar: (v: VisitaEncolada) => void | Promise<void>;
}) {
  const tier = tierFor(parada);
  const tierVar = TIER_VAR[tier];
  const visitada = parada.resultado != null;

  return (
    <li
      className="group relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow duration-150 hover:shadow-md"
      style={visitada ? { opacity: 0.92 } : undefined}
    >
      {/* 4px left tier strip */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: `hsl(var(${tierVar}))`, opacity: tier === "futuro" ? 0.5 : 0.9 }}
        aria-hidden="true"
      />

      <div className="pl-4 pr-3.5 py-3.5">
        <div className="flex items-center gap-3">
          {/* Avatar + risk dot */}
          <span className="relative shrink-0">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                background: `hsl(var(${tierVar}) / 0.12)`,
                color: `hsl(var(${tierVar}))`,
                border: `1.5px solid hsl(var(${tierVar}) / 0.22)`,
                ...MONO,
              }}
              aria-hidden="true"
            >
              {avatarFor(parada)}
            </span>
            <span
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2"
              style={{
                background: `hsl(var(${tierVar}))`,
                borderColor: "hsl(var(--surface))",
              }}
              aria-hidden="true"
            />
          </span>

          {/* Identity */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-text">
                Préstamo{" "}
                <span style={MONO} className="font-medium">
                  {parada.prestamo_id.slice(0, 8)}
                </span>
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-text-subtle">
              <PinIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Parada <span style={MONO}>#{parada.orden}</span> · {TIER_LABEL[tier]}
              </span>
            </div>
          </div>

          {/* Amount to collect */}
          <div className="shrink-0 text-right">
            <div className="text-[0.625rem] uppercase tracking-wide text-text-subtle">
              {visitada ? "Cobrado" : "A cobrar"}
            </div>
            <MoneyText
              value={visitada ? (parada.monto_cobrado ?? "0.00") : parada.saldo_exigible}
              intent={visitada ? "income" : "neutral"}
              className="text-base font-bold"
            />
          </div>
        </div>

        {/* Action zone */}
        <div className="mt-3">
          {capturando ? (
            <VisitaCaptureForm
              parada={parada}
              rutaId={rutaId}
              onGuardar={onGuardar}
              onCancelar={onCerrar}
            />
          ) : visitada ? (
            // Visitada: se puede re-abrir para corregir. La corrección crea una
            // NUEVA entrada de cola con device id + pago_id frescos (encolarVisita
            // es idempotente por id; el backend trata mismo pago_id+otro monto como
            // 409 → por eso siempre minteamos ids nuevos). Spec §5.5.7.
            <div className="flex items-center justify-between gap-2">
              <Badge tone={RESULTADO_TONE[parada.resultado!] ?? "default"}>
                Visitada: {parada.resultado}
              </Badge>
              <Button size="sm" variant="outline" onClick={onAbrir}>
                Corregir
              </Button>
            </div>
          ) : (
            <Button size="sm" className="w-full" onClick={onAbrir}>
              Registrar visita
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * La Ruta — the cobrador's offline-first field screen. Loads the assigned route,
 * lists stops ordered by collection priority (debt-weighted tiers), captures
 * visits into the IndexedDB queue, and shows live sync status. Offline submits
 * only enqueue; online submits enqueue + sync. Mobile-first.
 */
export function RutaPage({ rutaId }: { rutaId: string }) {
  const paradasQ = useParadas(rutaId);
  const cajasQ = useCajas();
  const cajas = (cajasQ.data?.data ?? []).filter((c) => c.activo);
  // El cobrador elige su caja para la ruta; viaja en cada sync (caja_id). Sin
  // ella el backend rechaza los cobros con 422 caja_requerida.
  const [cajaId, setCajaId] = useState<string>("");
  const { online, sincronizando, ultimo, error, sincronizarAhora } = useRutaSync(
    rutaId,
    cajaId || undefined,
  );
  const [pendientes, setPendientes] = useState(0);
  const [capturando, setCapturando] = useState<string | null>(null);

  const refrescarPendientes = useCallback(async () => {
    setPendientes(await contarPendientes());
  }, []);

  useEffect(() => {
    void refrescarPendientes();
  }, [refrescarPendientes, ultimo]);

  const onGuardar = useCallback(
    async (v: VisitaEncolada) => {
      await encolarVisita(v);
      await refrescarPendientes();
      setCapturando(null);
      // Online → enqueue + sync; offline → enqueue only (no POST).
      if (online) {
        await sincronizarAhora();
        await refrescarPendientes();
      }
    },
    [online, sincronizarAhora, refrescarPendientes],
  );

  const paradas = useMemo(() => paradasQ.data?.data ?? [], [paradasQ.data]);

  // Priority ordering: vencido → actual → futuro → hecho. Within a tier keep the
  // original `orden` so the route walk stays geographically coherent.
  const ordenadas = useMemo(() => {
    const rank: Record<Tier, number> = { vencido: 0, actual: 1, futuro: 2, hecho: 3 };
    return [...paradas].sort((a, b) => {
      const dr = rank[tierFor(a)] - rank[tierFor(b)];
      return dr !== 0 ? dr : a.orden - b.orden;
    });
  }, [paradas]);

  return (
    <div data-testid="ruta-root" className="mx-auto max-w-md space-y-4 px-1 pb-24">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between gap-3 pt-1">
        <div>
          <h1
            className="text-xl font-bold tracking-tight text-text"
            style={{ letterSpacing: "-0.02em" }}
          >
            Ruta de cobranza
          </h1>
          <p className="text-xs text-text-muted">Hoja de ruta del día</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              background: online ? "hsl(var(--pos-bg))" : "hsl(var(--warn-bg))",
              color: online ? "hsl(var(--pos))" : "hsl(var(--warn))",
              border: `1px solid ${online ? "hsl(var(--pos-border))" : "hsl(var(--warn-border))"}`,
            }}
          >
            {online ? (
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                  style={{ background: "hsl(var(--pos))" }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: "hsl(var(--pos))" }}
                />
              </span>
            ) : (
              <WifiOffIcon className="h-3 w-3" />
            )}
            {online ? "En línea" : "Sin conexión"}
          </span>
          <span
            data-testid="sync-status"
            className="text-[0.6875rem] text-text-subtle"
            style={MONO}
          >
            {pendientes} pendiente{pendientes === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {/* ── Day summary ── */}
      {!paradasQ.isLoading && !paradasQ.isError && <RutaHeader paradas={paradas} />}

      {/* ── Caja + sync control bar ── */}
      <div className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
        <label
          htmlFor="caja"
          className="text-xs font-semibold uppercase tracking-wide text-text-subtle"
        >
          Caja de la ruta
        </label>
        <select
          id="caja"
          className="mt-1.5 h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brand)/0.2)]"
          value={cajaId}
          onChange={(e) => setCajaId(e.target.value)}
        >
          <option value="">Seleccioná una caja…</option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {!cajaId && (
          <p
            className="mt-1.5 flex items-start gap-1.5 text-xs"
            style={{ color: "hsl(var(--warn))" }}
          >
            <span aria-hidden="true">⚠</span>
            Seleccioná una caja para poder sincronizar los cobros de la ruta.
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="min-w-0 text-[0.6875rem] text-text-subtle">
            {ultimo?.enviado ? (
              <span>
                <span style={MONO} className="text-pos">
                  {ultimo.aplicadas}
                </span>{" "}
                aplicadas · <span style={MONO}>{ultimo.omitidas}</span> omitidas ·{" "}
                <span style={MONO} className={ultimo.rechazadas > 0 ? "text-neg" : undefined}>
                  {ultimo.rechazadas}
                </span>{" "}
                rechazadas
              </span>
            ) : (
              <span>Cobros pendientes de envío al servidor.</span>
            )}
          </div>
          <TransactionButton
            size="sm"
            variant="outline"
            onClick={() => void sincronizarAhora()}
            disabled={pendientes === 0}
            pending={sincronizando}
            className="shrink-0 gap-1.5"
          >
            <SyncIcon className={`h-3.5 w-3.5 ${sincronizando ? "animate-spin" : ""}`} />
            {sincronizando ? "Sincronizando…" : "Sincronizar"}
          </TransactionButton>
        </div>
      </div>

      {/* ── Sync error ── */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border p-3 text-sm"
          style={{
            borderColor: "hsl(var(--neg-border))",
            background: "hsl(var(--neg-bg))",
            color: "hsl(var(--neg))",
          }}
        >
          <span aria-hidden="true" className="mt-px">
            ⚠
          </span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Stop list ── */}
      {paradasQ.isLoading ? (
        <StopSkeleton />
      ) : paradasQ.isError ? (
        <div
          role="alert"
          className="rounded-xl border px-5 py-10 text-center"
          style={{ borderColor: "hsl(var(--neg-border))", background: "hsl(var(--neg-bg))" }}
        >
          <p className="text-sm font-semibold" style={{ color: "hsl(var(--neg))" }}>
            No se pudo cargar la ruta
          </p>
          <p className="mt-1 text-xs" style={{ color: "hsl(var(--neg) / 0.75)" }}>
            Reintentá en unos segundos o trabajá offline.
          </p>
        </div>
      ) : ordenadas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "hsl(var(--brand-subtle))", color: "hsl(var(--brand))" }}
          >
            <RouteIcon className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold text-text">Ruta sin paradas</p>
          <p className="mt-1 max-w-[15rem] text-sm leading-relaxed text-text-muted">
            No tenés clientes asignados para hoy. Disfrutá el café.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {ordenadas.map((p) => (
            <StopCard
              key={p.id}
              parada={p}
              rutaId={rutaId}
              capturando={capturando === p.id}
              onAbrir={() => setCapturando(p.id)}
              onCerrar={() => setCapturando(null)}
              onGuardar={onGuardar}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
