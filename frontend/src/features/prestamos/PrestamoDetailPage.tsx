import { useParams, Link } from "@tanstack/react-router";
import {
  usePrestamo,
  useCuotas,
  usePagosDePrestamo,
  usePayoff,
  usePersona,
} from "@/lib/api/queries";
import { MoneyText } from "@/components/MoneyText";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// ─── Risk bucket helpers (shared vocabulary with FichaCliente360) ─────────────

type RiskBucket = "0" | "30" | "60" | "90" | "castigo";

function getRiskBucket(dias: number): RiskBucket {
  if (dias <= 0) return "0";
  if (dias <= 30) return "30";
  if (dias <= 60) return "60";
  if (dias <= 90) return "90";
  return "castigo";
}

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
  "30": "Mora ≤30d",
  "60": "Mora ≤60d",
  "90": "Mora ≤90d",
  castigo: "Castigado",
};

// ─── Loan status → badge tone ─────────────────────────────────────────────────

type StatusTone = "pos" | "warn" | "neg" | "brand" | "neutral";

const STATUS_TONE: Record<string, StatusTone> = {
  vigente: "brand",
  activo: "brand",
  desembolsado: "brand",
  al_dia: "pos",
  cancelado: "pos",
  pagado: "pos",
  finalizado: "pos",
  mora: "warn",
  vencido: "neg",
  castigado: "neg",
  refinanciado: "warn",
  novado: "warn",
};

const STATUS_CHIP: Record<StatusTone, string> = {
  pos: "bg-pos/10 text-pos border-pos/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  neg: "bg-neg/10 text-neg border-neg/25",
  brand: "bg-brand-subtle text-brand border-brand/20",
  neutral: "bg-surface-sunken text-text-muted border-border",
};

function statusTone(estado: string): StatusTone {
  return STATUS_TONE[estado.toLowerCase()] ?? "neutral";
}

// ─── Cuota status → row intent ────────────────────────────────────────────────

type CuotaIntent = "pagada" | "vencida" | "vigente" | "parcial";

function cuotaIntent(estado: string, vencimiento: string | null, today: string): CuotaIntent {
  const e = estado.toLowerCase();
  if (e.includes("pag") && !e.includes("parcial")) return "pagada";
  if (e.includes("parcial")) return "parcial";
  if (e.includes("venc") || e.includes("mora")) return "vencida";
  // Fallback: derive from due date when estado is generic ("pendiente").
  if (vencimiento && vencimiento < today) return "vencida";
  return "vigente";
}

const CUOTA_DOT: Record<CuotaIntent, string> = {
  pagada: "bg-pos",
  vencida: "bg-neg",
  parcial: "bg-warn",
  vigente: "bg-border-strong",
};

const CUOTA_CHIP: Record<CuotaIntent, string> = {
  pagada: "bg-pos/10 text-pos border-pos/25",
  vencida: "bg-neg/10 text-neg border-neg/25",
  parcial: "bg-warn/10 text-warn border-warn/25",
  vigente: "bg-surface-sunken text-text-muted border-border",
};

const CUOTA_ROW_ACCENT: Record<CuotaIntent, string> = {
  pagada: "before:bg-pos/50",
  vencida: "before:bg-neg",
  parcial: "before:bg-warn",
  vigente: "before:bg-transparent",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function extractTasa(snapshot: Record<string, unknown> | null | undefined): string | null {
  if (!snapshot) return null;
  const keys = ["tna", "tasa_nominal_anual", "tasa", "tasa_mensual", "tnm"];
  for (const k of keys) {
    const v = snapshot[k];
    if (typeof v === "number") return String(v);
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

type KpiIntent = "neutral" | "pos" | "warn" | "neg" | "brand";

const KPI_VALUE_CLASS: Record<KpiIntent, string> = {
  neutral: "text-text",
  pos: "text-pos",
  warn: "text-warn",
  neg: "text-neg",
  brand: "text-brand",
};

function KpiTile({
  label,
  value,
  unit,
  intent = "neutral",
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  intent?: KpiIntent;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4">
      <span className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-2xl font-bold leading-none tabular-nums ${KPI_VALUE_CLASS[intent]}`}
          style={MONO}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs font-medium text-text-subtle" style={MONO}>
            {unit}
          </span>
        )}
      </div>
      {hint && <span className="text-[11px] text-text-subtle">{hint}</span>}
    </div>
  );
}

// ─── Section shell ────────────────────────────────────────────────────────────

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {count !== undefined && (
            <span
              className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-text-muted tabular-nums"
              style={MONO}
            >
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── Page-level states ────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando préstamo">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="relative border-b border-border bg-surface-sunken/40 px-6 py-6">
          <div className="absolute inset-y-0 left-0 w-1 animate-pulse bg-surface-sunken" />
          <div className="space-y-3 pl-3">
            <div className="h-3 w-28 animate-pulse rounded bg-surface-sunken" />
            <div className="h-11 w-64 animate-pulse rounded bg-surface-sunken" />
            <div className="h-3 w-44 animate-pulse rounded bg-surface-sunken" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 border-r border-border px-5 py-4 last:border-r-0">
              <div className="h-2.5 w-16 animate-pulse rounded bg-surface-sunken" />
              <div className="h-7 w-12 animate-pulse rounded bg-surface-sunken" />
            </div>
          ))}
        </div>
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-border bg-surface-sunken/40" />
    </div>
  );
}

function PageError() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-neg-border bg-neg-bg p-4 text-sm text-neg"
    >
      <span aria-hidden="true" className="mt-0.5 leading-none">
        ⚠
      </span>
      <span>No se pudo cargar el préstamo. Revisá el identificador e intentá de nuevo.</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PrestamoDetailPage() {
  const { prestamoId } = useParams({ strict: false }) as { prestamoId: string };
  const prestamoQ = usePrestamo(prestamoId);
  const { data: cuotasData } = useCuotas(prestamoId);
  const { data: pagosData } = usePagosDePrestamo(prestamoId);
  const { data: payoff } = usePayoff(prestamoId);
  const personaId = prestamoQ.data?.persona_id ?? "";
  const { data: persona } = usePersona(personaId);

  if (prestamoQ.isLoading) return <PageSkeleton />;
  if (prestamoQ.isError || !prestamoQ.data) return <PageError />;

  const prestamo = prestamoQ.data;
  const clienteNombre = persona ? `${persona.nombre} ${persona.apellido}` : null;
  const cuotas = cuotasData ?? [];
  const pagos = pagosData?.data ?? [];
  const today = todayISO();

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const intents = cuotas.map((c) => cuotaIntent(c.estado, c.vencimiento, today));
  const pagadas = intents.filter((i) => i === "pagada").length;
  const restantes = cuotas.length - pagadas;
  const vencidas = intents.filter((i) => i === "vencida").length;

  // Mora días = peor vencimiento impago vencido respecto a hoy.
  const moraDias = cuotas.reduce((worst, c, idx) => {
    if (intents[idx] === "vencida" && c.vencimiento) {
      const d = daysBetween(c.vencimiento, today);
      return d > worst ? d : worst;
    }
    return worst;
  }, 0);

  const bucket = getRiskBucket(moraDias);
  const tone = statusTone(prestamo.estado);
  const tasa = extractTasa(prestamo.snapshot_terminos);

  const cuotasIntent: KpiIntent = restantes === 0 ? "pos" : vencidas > 0 ? "neg" : "brand";
  const moraIntent: KpiIntent = moraDias === 0 ? "pos" : moraDias <= 30 ? "warn" : "neg";

  return (
    <div className="space-y-6">
      {/* ── HERO + KPI strip ──────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {/* Risk-colored hero band — the loan amount is the dominant element */}
        <div className={`relative border-b ${RISK_HERO_BG[bucket]} px-6 py-6`}>
          <div
            className={`absolute inset-y-0 left-0 w-1 ${RISK_ACCENT_BAR[bucket]}`}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-5 pl-3 sm:flex-row sm:items-end sm:justify-between">
            {/* Left: identity + dominant amount */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium tracking-widest text-text-muted" style={MONO}>
                  PRÉSTAMO #{prestamoId.slice(0, 8).toUpperCase()}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${STATUS_CHIP[tone]}`}
                >
                  {prestamo.estado}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${RISK_BADGE_BG[bucket]}`}
                >
                  {RISK_LABEL[bucket]}
                  {moraDias > 0 && <span className="ml-1 opacity-70">· {moraDias}d</span>}
                </span>
              </div>
              {clienteNombre && (
                <Link
                  to="/personas/$personaId"
                  params={{ personaId }}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-text-muted transition-colors hover:text-brand"
                >
                  <span aria-hidden="true">↗</span>
                  {clienteNombre}
                </Link>
              )}

              <div className="mt-3">
                <span className="block text-[11px] font-medium uppercase tracking-wider text-text-subtle">
                  Capital otorgado
                </span>
                <MoneyText
                  value={prestamo.capital ?? null}
                  className="mt-1 block text-3xl font-bold leading-none tracking-tight text-text sm:text-4xl"
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-subtle">
                <span>
                  Desembolsado{" "}
                  <span className="text-text-muted" style={MONO}>
                    {formatDate(prestamo.fecha_desembolso)}
                  </span>
                </span>
                {prestamo.monto_desembolsado && (
                  <span className="flex items-center gap-1">
                    Neto acreditado{" "}
                    <MoneyText value={prestamo.monto_desembolsado} className="text-text-muted" />
                  </span>
                )}
              </div>
            </div>

            {/* Right: cancelación anticipada — the actionable "what do I owe today" */}
            {payoff && (
              <div
                className={`shrink-0 rounded-lg border ${RISK_HERO_BG[bucket]} px-4 py-3 text-right`}
              >
                <span className="block text-[10px] font-medium uppercase tracking-wider text-text-subtle">
                  Cancelación al {formatDate(payoff.fecha_negocio)}
                </span>
                <MoneyText
                  value={payoff.total}
                  className={`mt-1 block text-xl font-bold leading-none tracking-tight ${RISK_TEXT[bucket]}`}
                />
              </div>
            )}
          </div>
        </div>

        {/* KPI strip — color intent lives on the number itself */}
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <KpiTile
            label="Tasa"
            value={tasa ?? "—"}
            unit={tasa ? "%" : undefined}
            intent="neutral"
            hint={tasa ? "Según términos" : "No informada"}
          />
          <KpiTile
            label="Plazo"
            value={cuotas.length > 0 ? String(cuotas.length) : "—"}
            unit={cuotas.length > 0 ? "cuotas" : undefined}
            intent="neutral"
            hint={cuotas.length > 0 ? `${pagadas} pagadas` : "Sin cronograma"}
          />
          <KpiTile
            label="Cuotas restantes"
            value={cuotas.length > 0 ? String(restantes) : "—"}
            intent={cuotasIntent}
            hint={
              cuotas.length === 0
                ? "—"
                : vencidas > 0
                  ? `${vencidas} vencida${vencidas === 1 ? "" : "s"}`
                  : restantes === 0
                    ? "Cancelado"
                    : "Al día"
            }
          />
          <KpiTile
            label="Mora"
            value={String(moraDias)}
            unit="días"
            intent={moraIntent}
            hint={moraDias === 0 ? "Sin atraso" : RISK_LABEL[bucket]}
          />
        </div>
      </div>

      {/* ── Cronograma de cuotas ──────────────────────────────────────────── */}
      <Section title="Cronograma de cuotas" count={cuotas.length}>
        {cuotas.length === 0 ? (
          <EmptyState
            title="Sin cronograma"
            detail="Este préstamo todavía no tiene cuotas generadas."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["#", "Vencimiento", "Capital", "Interés", "Cuota", "Estado"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-subtle ${
                        i >= 2 && i <= 4 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuotas.map((c, idx) => {
                  const intent = intents[idx];
                  return (
                    <tr
                      key={c.id}
                      className={`group relative border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-sunken/50 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] ${CUOTA_ROW_ACCENT[intent]}`}
                    >
                      <td className="px-5 py-2.5">
                        <span
                          className="inline-flex items-center gap-2 text-text-muted tabular-nums"
                          style={MONO}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${CUOTA_DOT[intent]}`}
                            aria-hidden="true"
                          />
                          {c.numero}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-text-muted tabular-nums" style={MONO}>
                        {formatDate(c.vencimiento)}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <MoneyText value={c.capital ?? null} align="right" />
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <MoneyText value={c.interes ?? null} align="right" />
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold">
                        <MoneyText value={c.cuota ?? null} align="right" />
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${CUOTA_CHIP[intent]}`}
                        >
                          {c.estado}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Historial de pagos (timeline) + Payoff breakdown ──────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section title="Historial de pagos" count={pagos.length}>
            {pagos.length === 0 ? (
              <EmptyState
                title="Sin pagos registrados"
                detail="Los pagos imputados a este préstamo aparecerán aquí."
              />
            ) : (
              <ol className="px-6 py-5">
                {[...pagos]
                  .sort((a, b) => (b.fecha_negocio ?? "").localeCompare(a.fecha_negocio ?? ""))
                  .map((p, idx, arr) => {
                    const isLast = idx === arr.length - 1;
                    const dot =
                      p.estado.toLowerCase().includes("anul") ||
                      p.estado.toLowerCase().includes("rech")
                        ? "bg-neg border-neg/40"
                        : "bg-pos border-pos/40";
                    return (
                      <li key={p.id} className="relative flex gap-4 pb-5 last:pb-0">
                        {!isLast && (
                          <div
                            aria-hidden="true"
                            className="absolute bottom-0 left-[5px] top-3 w-px bg-border"
                          />
                        )}
                        <div
                          aria-hidden="true"
                          className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${dot}`}
                        />
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <MoneyText
                              value={p.monto ?? null}
                              intent="income"
                              className="text-base font-semibold"
                            />
                            <span
                              className="text-[11px] text-text-subtle tabular-nums"
                              style={MONO}
                            >
                              {formatDate(p.fecha_negocio)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-subtle">
                            {p.canal && (
                              <span className="inline-flex items-center rounded-full border border-border bg-surface-sunken px-1.5 py-px font-medium text-text-muted">
                                {p.canal}
                              </span>
                            )}
                            <span className="capitalize">{p.estado}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
              </ol>
            )}
          </Section>
        </div>

        {/* Payoff detail */}
        {payoff && (
          <div className="lg:col-span-2" aria-label="payoff">
            <Section title="Saldo de cancelación">
              <div className="px-5 py-4">
                <p className="mb-3 text-[11px] text-text-subtle">
                  Proyectado al{" "}
                  <span className="text-text-muted" style={MONO}>
                    {formatDate(payoff.fecha_negocio)}
                  </span>
                </p>
                <dl className="space-y-px overflow-hidden rounded-lg border border-border">
                  <PayoffRow label="Capital" value={payoff.capital} />
                  <PayoffRow label="Interés" value={payoff.interes} />
                  <PayoffRow label="Punitorio" value={payoff.punitorio} accent="warn" />
                  <div
                    className={`flex items-center justify-between ${RISK_HERO_BG[bucket]} px-4 py-3`}
                  >
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text">
                      Total a cancelar
                    </dt>
                    <dd>
                      <MoneyText
                        value={payoff.total}
                        className={`text-lg font-bold tracking-tight ${RISK_TEXT[bucket]}`}
                      />
                    </dd>
                  </div>
                </dl>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small building blocks ────────────────────────────────────────────────────

function PayoffRow({ label, value, accent }: { label: string; value: string; accent?: "warn" }) {
  return (
    <div className="flex items-center justify-between bg-surface px-4 py-2.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd>
        <MoneyText
          value={value}
          className={accent === "warn" ? "text-sm text-warn" : "text-sm text-text"}
        />
      </dd>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
        <span className="text-lg text-text-subtle" aria-hidden="true">
          ○
        </span>
      </div>
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="text-xs text-text-subtle">{detail}</p>
    </div>
  );
}
