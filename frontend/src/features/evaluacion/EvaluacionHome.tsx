import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSolicitudes, usePersonas, useSolicitud } from "@/lib/api/queries";
import { useTablero, useAlertas } from "@/features/riesgo/hooks";
import { formatPercent, severidadTone } from "@/features/riesgo/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/MoneyText";
import type { components } from "@/lib/api/schema";

type Solicitud = components["schemas"]["SolicitudOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// Cola del analista de riesgo, priorizada por estado del workflow. El orden de
// las secciones ES la prioridad: lo que está en evaluación primero, luego lo
// evaluado pendiente de aprobar, y al final lo recién ingresado.
const SECCIONES_COLA: { estado: string; title: string }[] = [
  { estado: "en_evaluacion", title: "En evaluación" },
  { estado: "evaluada", title: "Evaluadas · pendientes de aprobar" },
  { estado: "ingresada", title: "Ingresadas" },
];

const ESTADO_TONE: Record<string, "default" | "warning" | "success" | "danger"> = {
  ingresada: "default",
  en_evaluacion: "warning",
  evaluada: "warning",
  aprobada: "success",
  rechazada: "danger",
};

const ESTADO_LABEL: Record<string, string> = {
  ingresada: "Ingresada",
  en_evaluacion: "En evaluación",
  evaluada: "Evaluada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

// PAR30 por encima de este umbral pinta el KPI en tono de alarma.
const PAR30_UMBRAL = 10;

// El strip lateral de cada fila usa la escala de mora ORDINAL como color HERO.
// Sin días de atraso disponibles en la solicitud, derivamos el bucket del
// score crediticio (mayor score → menor riesgo). Los umbrales siguen la escala
// de 5 puntos: al_dia / par30 / par60 / par90 / castigo.
type RiskKey = "risk-0" | "risk-30" | "risk-60" | "risk-90" | "risk-castigo";

function riskFromScore(score: number | null | undefined): RiskKey {
  if (score == null) return "risk-60";
  if (score >= 750) return "risk-0";
  if (score >= 600) return "risk-30";
  if (score >= 450) return "risk-60";
  if (score >= 300) return "risk-90";
  return "risk-castigo";
}

function idCorto(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Home integrado del ANALISTA DE RIESGO. Antes su trabajo estaba fragmentado en
 * tres pantallas (/evaluacion, /riesgo/tablero, /riesgo/alertas) sin contexto
 * compartido. Acá converge: hero de KPIs de riesgo + alertas activas + la cola
 * de solicitudes a evaluar, priorizada. El detalle (tablero completo, alertas)
 * sigue accesible vía deep-link desde los KPIs.
 */
export function EvaluacionHome() {
  const navigate = useNavigate();
  const solicitudesQ = useSolicitudes();
  const personasQ = usePersonas();
  const tableroQ = useTablero();
  const alertasQ = useAlertas();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nombrePorPersona = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of personasQ.data?.data ?? []) {
      map.set(p.id, `${p.nombre} ${p.apellido}`.trim());
    }
    return map;
  }, [personasQ.data]);

  if (solicitudesQ.isLoading) {
    return <EvaluacionSkeleton />;
  }
  if (solicitudesQ.isError) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div
          role="alert"
          className="flex max-w-sm flex-col items-center gap-2 rounded-xl border border-neg-border bg-neg-bg px-6 py-8 text-center"
        >
          <span className="text-sm font-semibold text-neg">No se pudo cargar la cola</span>
          <span className="text-xs text-text-muted">
            Reintentá en unos segundos o revisá tu conexión.
          </span>
        </div>
      </div>
    );
  }

  const solicitudes = solicitudesQ.data?.data ?? [];
  const aEvaluar = solicitudes.filter((s) => SECCIONES_COLA.some((sec) => sec.estado === s.estado));
  const alertasActivas = (alertasQ.data?.data ?? []).filter((a) => a.estado === "activa");
  const tablero = tableroQ.data;
  const par30 = tablero ? Number(tablero.par30) : null;

  const enEvaluacion = aEvaluar.filter((s) => s.estado === "en_evaluacion").length;
  const evaluadas = aEvaluar.filter((s) => s.estado === "evaluada").length;
  const aprobadasHoy = solicitudes.filter((s) => s.estado === "aprobada").length;

  const colaVacia = aEvaluar.length === 0;

  return (
    <div className="space-y-8">
      {/* ── Encabezado ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
            Mesa de riesgo
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-none text-text">Evaluación</h1>
        </div>
        <p className="text-sm text-text-muted">
          <span style={MONO} className="text-base font-semibold text-text">
            {aEvaluar.length}
          </span>{" "}
          {aEvaluar.length === 1 ? "solicitud" : "solicitudes"} en tu cola de riesgo
        </p>
      </header>

      {/* ── Hero KPI strip ─────────────────────────────────────────── */}
      <section aria-label="Indicadores de la cola">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm sm:grid-cols-3">
          <HeroKpi
            label="En evaluación"
            value={enEvaluacion}
            accent="warn"
            hint="trabajando ahora"
          />
          <HeroKpi
            label="Pendientes de aprobar"
            value={evaluadas}
            accent="brand"
            hint="esperan tu firma"
          />
          <HeroKpi label="Aprobadas hoy" value={aprobadasHoy} accent="pos" hint="cerradas" />
        </div>

        {/* Mini-tablero de cartera, deep-link al detalle. */}
        <div className="mt-px grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm sm:grid-cols-3">
          <ContextKpi
            label="PAR30"
            value={tablero ? formatPercent(tablero.par30) : "—"}
            danger={par30 != null && par30 >= PAR30_UMBRAL}
            onClick={() => navigate({ to: "/riesgo/tablero" as string })}
          />
          <ContextKpi
            label="Cartera total"
            value={tablero ? <MoneyText value={tablero.cartera_total} /> : "—"}
            onClick={() => navigate({ to: "/riesgo/tablero" as string })}
          />
          <ContextKpi
            label="Alertas activas"
            value={`${alertasActivas.length}`}
            warn={alertasActivas.length > 0}
            onClick={() => navigate({ to: "/riesgo/alertas" as string })}
          />
        </div>
      </section>

      {/* ── Alertas inline: top-3 activas ──────────────────────────── */}
      {alertasActivas.length > 0 && (
        <section className="relative overflow-hidden rounded-xl border border-warn-border bg-warn-bg shadow-sm">
          <span className="absolute inset-y-0 left-0 w-1 bg-warn" aria-hidden />
          <div className="space-y-3 p-4 pl-5">
            <div className="flex items-center justify-between">
              <CardTitle className="mb-0 text-warn">Alertas de riesgo</CardTitle>
              <button
                type="button"
                className="text-xs font-medium text-brand transition-colors duration-150 hover:underline"
                onClick={() => navigate({ to: "/riesgo/alertas" as string })}
              >
                Ver todas
              </button>
            </div>
            <ul className="space-y-1.5">
              {alertasActivas.slice(0, 3).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 border-t border-warn-border/60 pt-1.5 text-sm first:border-t-0 first:pt-0"
                >
                  <span className="truncate font-medium text-text">{a.tipo ?? "Alerta"}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    {a.metrica && (
                      <span className="text-xs text-text-muted">
                        {a.metrica}:{" "}
                        <span style={MONO} className="text-text">
                          {a.valor ?? "—"}
                        </span>
                      </span>
                    )}
                    <Badge tone={severidadTone(a.severidad)}>{a.severidad ?? "—"}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Cola priorizada (master) + detalle (detail) ────────────── */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:w-[44%]">
          <SectionHeader>Cola de evaluación</SectionHeader>
          {colaVacia ? (
            <EmptyCola />
          ) : (
            <div className="space-y-5">
              {SECCIONES_COLA.map((sec) => {
                const items = aEvaluar.filter((s) => s.estado === sec.estado);
                if (items.length === 0) return null;
                return (
                  <div key={sec.estado} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-text-subtle">
                        {sec.title}
                      </h3>
                      <span
                        style={MONO}
                        className="rounded-full bg-surface-sunken px-1.5 text-[11px] font-semibold text-text-muted"
                      >
                        {items.length}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {items.map((s) => (
                        <li key={s.id}>
                          <SolicitudCard
                            solicitud={s}
                            nombre={nombrePorPersona.get(s.persona_id)}
                            selected={s.id === selectedId}
                            onSelect={() => setSelectedId(s.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:w-[56%]">
          <SectionHeader>Detalle</SectionHeader>
          <SolicitudDetail
            solicitudId={selectedId}
            nombrePorPersona={nombrePorPersona}
            onAbrir={(id) => navigate({ to: `/solicitudes/${id}` as string })}
          />
        </div>
      </div>
    </div>
  );
}

/** Encabezado de sección, uppercase con tracking ancho. */
function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-text-muted">
      {children}
    </h2>
  );
}

const ACCENT_TEXT: Record<"warn" | "brand" | "pos", string> = {
  warn: "text-warn",
  brand: "text-brand",
  pos: "text-pos",
};
const ACCENT_BAR: Record<"warn" | "brand" | "pos", string> = {
  warn: "bg-warn",
  brand: "bg-brand",
  pos: "bg-pos",
};

/** Celda grande del hero: número dominante en mono con intención de color. */
function HeroKpi({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: "warn" | "brand" | "pos";
  hint: string;
}) {
  const active = value > 0;
  return (
    <div className="relative bg-surface p-5 transition-colors duration-150">
      <span
        className={`absolute inset-y-0 left-0 w-1 ${active ? ACCENT_BAR[accent] : "bg-border"}`}
        aria-hidden
      />
      <div className="pl-2">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
        <p
          style={MONO}
          className={`mt-2 text-4xl font-semibold leading-none tabular-nums ${
            active ? ACCENT_TEXT[accent] : "text-text-subtle"
          }`}
        >
          {value}
        </p>
        <p className="mt-1.5 text-xs text-text-subtle">{hint}</p>
      </div>
    </div>
  );
}

/** KPI de contexto clickeable: lleva al detalle de cartera/alertas. */
function ContextKpi({
  label,
  value,
  danger,
  warn,
  onClick,
}: {
  label: string;
  value: ReactNode;
  danger?: boolean;
  warn?: boolean;
  onClick?: () => void;
}) {
  const tone = danger ? "text-neg" : warn ? "text-warn" : "text-text";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-baseline justify-between gap-3 bg-surface px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-sunken"
    >
      <span className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</span>
      <span style={MONO} className={`text-base font-semibold tabular-nums ${tone}`}>
        {value}
      </span>
    </button>
  );
}

/** Fila de la cola: strip de riesgo, avatar tipográfico, score/monto, acción. */
function SolicitudCard({
  solicitud: s,
  nombre,
  selected,
  onSelect,
}: {
  solicitud: Solicitud;
  nombre: string | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const risk = riskFromScore(s.score);
  const display = nombre ?? `Solicitud #${idCorto(s.id)}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border bg-surface p-3 pl-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
        selected ? "border-brand ring-1 ring-brand" : "border-border hover:border-border-strong"
      }`}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: `hsl(var(--${risk}))` }}
        aria-hidden
      />
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
        style={{
          backgroundColor: `hsl(var(--${risk}) / 0.14)`,
          color: `hsl(var(--${risk}))`,
        }}
        aria-hidden
      >
        {iniciales(display)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">{display}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
          <MoneyText value={s.monto ?? null} className="text-text-muted" />
          {s.cantidad_cuotas != null && (
            <>
              <span className="text-text-subtle">·</span>
              <span style={MONO} className="tabular-nums">
                {s.cantidad_cuotas}
              </span>{" "}
              cuotas
            </>
          )}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1.5">
        {s.score != null && (
          <span className="flex items-baseline gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-subtle">score</span>
            <span
              style={MONO}
              className="text-sm font-semibold tabular-nums"
              // El color del score sigue la misma escala de riesgo del strip.
            >
              <span style={{ color: `hsl(var(--${risk}))` }}>{s.score}</span>
            </span>
          </span>
        )}
        <Badge tone={ESTADO_TONE[s.estado] ?? "default"}>
          {ESTADO_LABEL[s.estado] ?? s.estado}
        </Badge>
      </span>
    </button>
  );
}

/** Estado vacío de la cola, con personalidad. */
function EmptyCola() {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-pos-bg text-lg font-semibold text-pos"
        aria-hidden
      >
        ✓
      </span>
      <p className="text-sm font-semibold text-text">Cola al día</p>
      <p className="max-w-[14rem] text-xs text-text-muted">
        No hay solicitudes esperando evaluación. Buen momento para revisar el tablero.
      </p>
    </div>
  );
}

/** Panel detalle del split-view: muestra la solicitud seleccionada de la cola. */
function SolicitudDetail({
  solicitudId,
  nombrePorPersona,
  onAbrir,
}: {
  solicitudId: string | null;
  nombrePorPersona: Map<string, string>;
  onAbrir: (id: string) => void;
}) {
  const solicitudQ = useSolicitud(solicitudId ?? "");
  const s = solicitudId ? solicitudQ.data : undefined;

  if (!solicitudId) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 text-center">
        <p className="text-sm font-medium text-text">Seleccioná una solicitud</p>
        <p className="max-w-[16rem] text-xs text-text-muted">
          Elegí una fila de la cola para ver monto, cuotas y score antes de abrir la evaluación
          completa.
        </p>
      </div>
    );
  }

  if (solicitudQ.isLoading) {
    return <DetailSkeleton />;
  }

  if (solicitudQ.isError || !s) {
    return (
      <Card className="min-h-[220px] rounded-xl">
        <p role="alert" className="text-sm font-medium text-neg">
          No se pudo cargar el detalle de la solicitud.
        </p>
      </Card>
    );
  }

  const nombre = nombrePorPersona.get(s.persona_id);
  const display = nombre ?? `Solicitud #${idCorto(s.id)}`;
  const risk = riskFromScore(s.score);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Banda superior coloreada por bucket de riesgo. */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{
          backgroundColor: `hsl(var(--${risk}) / 0.1)`,
          borderBottom: `1px solid hsl(var(--${risk}) / 0.25)`,
        }}
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
          style={{ backgroundColor: `hsl(var(--${risk}) / 0.18)`, color: `hsl(var(--${risk}))` }}
          aria-hidden
        >
          {iniciales(display)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-text">{display}</h3>
          {s.producto_id && (
            <p className="truncate text-xs text-text-muted">Producto #{idCorto(s.producto_id)}</p>
          )}
        </div>
        <Badge tone={ESTADO_TONE[s.estado] ?? "default"}>
          {ESTADO_LABEL[s.estado] ?? s.estado}
        </Badge>
      </div>

      <div className="space-y-5 p-5">
        {/* Métrica dominante (monto) + cluster compacto a la derecha. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Monto solicitado
            </p>
            <p className="mt-1">
              <MoneyText value={s.monto ?? null} className="text-3xl font-semibold" />
            </p>
          </div>
          {s.score != null && (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Score</p>
              <p
                style={{ ...MONO, color: `hsl(var(--${risk}))` }}
                className="mt-1 text-3xl font-semibold tabular-nums"
              >
                {s.score}
              </p>
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
          <DetailStat label="Cuotas" value={s.cantidad_cuotas != null ? s.cantidad_cuotas : "—"} />
          <DetailStat
            label="Tasa resuelta"
            value={s.tasa_resuelta != null ? formatPercent(s.tasa_resuelta) : "—"}
          />
        </dl>

        <Button onClick={() => onAbrir(s.id)} className="w-full">
          Abrir evaluación completa
        </Button>
      </div>
    </div>
  );
}

/** Celda de estadística del detalle: label en Inter, valor en Geist Mono. */
function DetailStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</dt>
      <dd style={MONO} className="mt-0.5 text-sm font-semibold tabular-nums text-text">
        {value}
      </dd>
    </div>
  );
}

/** Skeleton de carga inicial: hero + filas, no texto crudo. */
function EvaluacionSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Cargando cola de evaluación">
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-sunken" />
        <div className="h-7 w-40 animate-pulse rounded bg-surface-sunken" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 bg-surface p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-sunken" />
            <div className="h-9 w-16 animate-pulse rounded bg-surface-sunken" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 pl-4 shadow-sm"
          >
            <div className="h-10 w-10 animate-pulse rounded-lg bg-surface-sunken" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-surface-sunken" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-surface-sunken" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton del panel de detalle. */
function DetailSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      aria-busy="true"
    >
      <div className="flex items-center gap-3 bg-surface-sunken px-5 py-4">
        <div className="h-12 w-12 animate-pulse rounded-xl bg-border" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-border" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-border" />
        </div>
      </div>
      <div className="space-y-5 p-5">
        <div className="h-9 w-2/5 animate-pulse rounded bg-surface-sunken" />
        <div className="h-16 animate-pulse rounded-lg bg-surface-sunken" />
        <div className="h-10 animate-pulse rounded bg-surface-sunken" />
      </div>
    </div>
  );
}
