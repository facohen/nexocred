import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  useTareas,
  useCompletarTarea,
  useIncidentes,
  useProspectos,
  usePromoverProspecto,
} from "./hooks";
import type { components } from "@/lib/api/schema";

type Tarea = components["schemas"]["TareaOut"];
type Incidente = components["schemas"]["IncidenteOut"];
type Prospecto = components["schemas"]["ProspectoOut"];

/* ────────────────────────────────────────────────────────────────────────
 * Tokens. El sistema guarda canales HSL crudos (ej. --neg: "352 75% 47%"),
 * se envuelven en hsl(var(--token)). CERO hex/rgb/colores Tailwind palette.
 * ──────────────────────────────────────────────────────────────────────── */
const T = {
  brand: "hsl(var(--brand))",
  brandSubtle: "hsl(var(--brand-subtle))",
  brandText: "hsl(var(--brand))",
  brandBorder: "hsl(var(--brand-subtle))",
  surface: "hsl(var(--surface))",
  surfaceSunken: "hsl(var(--surface-sunken))",
  surfacePop: "hsl(var(--surface-sunken))",
  text: "hsl(var(--text))",
  textMuted: "hsl(var(--text-muted))",
  textSubtle: "hsl(var(--text-subtle))",
  border: "hsl(var(--border))",
  borderStrong: "hsl(var(--border-strong))",
  /* pos */
  posBg: "hsl(var(--pos-bg))",
  posText: "hsl(var(--pos))",
  posBorder: "hsl(var(--pos-border))",
  /* neg */
  negText: "hsl(var(--neg))",
  negBg: "hsl(var(--neg-bg))",
  negBorder: "hsl(var(--neg-border))",
  /* warn */
  warnText: "hsl(var(--warn))",
  warnBg: "hsl(var(--warn-bg))",
  warnBorder: "hsl(var(--warn-border))",
  /* info */
  infoText: "hsl(var(--info))",
  infoBg: "hsl(var(--info-bg))",
  infoBorder: "hsl(var(--info-border))",
  /* shadows */
  shadowXs: "var(--shadow-xs)",
  shadowSm: "var(--shadow-sm)",
  shadowPop: "var(--shadow-pop)",
} as const;

const MONO: CSSProperties = { fontFamily: "'Geist Mono', monospace" };

/* ── Utilidades de fecha ────────────────────────────────────────────────── */
function clasificar(tareas: Tarea[]): {
  vencidas: Tarea[];
  hoy: Tarea[];
  proximas: Tarea[];
} {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const pendientes = tareas.filter((t) => t.estado !== "completada");
  const vencidas: Tarea[] = [];
  const hoy: Tarea[] = [];
  const proximas: Tarea[] = [];
  for (const t of pendientes) {
    const v = t.vencimiento?.slice(0, 10);
    if (!v) proximas.push(t);
    else if (v < hoyISO) vencidas.push(t);
    else if (v === hoyISO) hoy.push(t);
    else proximas.push(t);
  }
  return { vencidas, hoy, proximas };
}

function diasHasta(iso?: string | null): number | null {
  if (!iso) return null;
  const dia = 86_400_000;
  const hoy = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const ref = new Date(iso.slice(0, 10)).getTime();
  if (Number.isNaN(ref)) return null;
  return Math.round((ref - hoy) / dia);
}

type Urgencia = "overdue" | "today" | "upcoming";

function etiquetaVencimiento(iso?: string | null, urgencia?: Urgencia): string {
  const d = diasHasta(iso);
  if (d === null) return "sin fecha";
  if (d < 0) return `${Math.abs(d)}d atrasada`;
  if (d === 0) return "vence hoy";
  if (d === 1) return "mañana";
  return urgencia === "upcoming" && iso ? iso.slice(0, 10) : `en ${d}d`;
}

/* ── Tipos de tab ─────────────────────────────────────────────────────── */
type TabId = "tareas" | "incidentes" | "prospectos";

interface TabDef {
  id: TabId;
  label: string;
  count: number;
}

/* ── Tab bar — underline-active, 150ms smooth ──────────────────────────── */
function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef[];
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Bandeja"
      className="flex items-center gap-0"
      style={{ borderBottom: `1px solid ${T.border}` }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const hasBadge = tab.count > 0;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className="group relative -mb-px flex items-center gap-2 px-4 py-3 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset"
            style={{
              color: isActive ? T.text : T.textMuted,
              borderBottom: `2px solid ${isActive ? T.brand : "transparent"}`,
              transition: "color 150ms ease, border-color 150ms ease",
            }}
          >
            <span style={{ transition: "color 150ms ease" }}>{tab.label}</span>
            {hasBadge && (
              <span
                className="inline-flex min-w-[1.375rem] items-center justify-center rounded-full px-1.5 py-px text-[10px] font-semibold leading-none tabular-nums"
                style={{
                  ...MONO,
                  color: isActive
                    ? tab.id === "incidentes" && tab.count > 0
                      ? T.negText
                      : T.brand
                    : T.textSubtle,
                  backgroundColor: isActive
                    ? tab.id === "incidentes" && tab.count > 0
                      ? T.negBg
                      : T.brandSubtle
                    : T.surfaceSunken,
                  border: `1px solid ${
                    isActive
                      ? tab.id === "incidentes" && tab.count > 0
                        ? T.negBorder
                        : "hsl(var(--brand-subtle))"
                      : T.border
                  }`,
                  transition: "all 150ms ease",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Pill semántica ───────────────────────────────────────────────────── */
function Pill({ text, bg, fg, border }: { text: string; bg: string; fg: string; border?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-px text-[10px] font-medium leading-none uppercase tracking-wide"
      style={{
        backgroundColor: bg,
        color: fg,
        border: `1px solid ${border ?? "transparent"}`,
        letterSpacing: "0.04em",
      }}
    >
      {text}
    </span>
  );
}

/* ── Estado vacío con carácter ────────────────────────────────────────── */
function EmptyState({ glyph, title, hint }: { glyph: string; title: string; hint: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg px-6 py-10 text-center"
      style={{
        border: `1px dashed ${T.border}`,
        backgroundColor: T.surfaceSunken,
      }}
    >
      <span aria-hidden className="text-xl" style={{ ...MONO, color: T.textSubtle }}>
        {glyph}
      </span>
      <p className="text-sm font-medium" style={{ color: T.text }}>
        {title}
      </p>
      <p className="text-xs" style={{ color: T.textSubtle }}>
        {hint}
      </p>
    </div>
  );
}

/* ── Encabezado de sección con acento lateral ─────────────────────────── */
function SectionHeader({
  label,
  count,
  accentColor,
  dimmed = false,
}: {
  label: string;
  count: number;
  accentColor: string;
  dimmed?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        aria-hidden
        className="h-2.5 w-0.5 rounded-full"
        style={{ backgroundColor: accentColor, opacity: dimmed ? 0.45 : 1 }}
      />
      <h2
        className="text-xs font-semibold uppercase tracking-widest"
        style={{
          color: dimmed ? T.textSubtle : T.textMuted,
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </h2>
      <span
        className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-px text-[10px] font-semibold leading-none"
        style={{
          ...MONO,
          color: dimmed ? T.textSubtle : T.textMuted,
          backgroundColor: T.surfaceSunken,
          border: `1px solid ${T.border}`,
        }}
      >
        {count}
      </span>
    </div>
  );
}

/* ── Card de tarea VENCIDA — máximo peso visual ───────────────────────── */
function OverdueCard({
  tarea,
  onCompletar,
  pendiente,
}: {
  tarea: Tarea;
  onCompletar: (t: Tarea) => void;
  pendiente: boolean;
}) {
  const [hover, setHover] = useState(false);
  const diasAtras = Math.abs(diasHasta(tarea.vencimiento) ?? 0);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center justify-between gap-4 overflow-hidden rounded-lg pl-5 pr-4 py-3.5"
      style={{
        backgroundColor: hover ? T.negBg : "hsl(var(--neg-bg))",
        border: `1px solid ${T.negBorder}`,
        boxShadow: hover ? T.shadowPop : T.shadowSm,
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition: "all 150ms ease",
      }}
    >
      {/* Priority strip */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
        style={{ backgroundColor: T.negText }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold" style={{ color: T.text }}>
          {tarea.titulo}
        </div>
        {tarea.descripcion && (
          <div className="mt-0.5 truncate text-xs" style={{ color: T.textMuted }}>
            {tarea.descripcion}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Días atrasada — héroe visual del estado vencido */}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
            style={{
              ...MONO,
              color: T.negText,
              backgroundColor: T.negBg,
              border: `1px solid ${T.negBorder}`,
            }}
          >
            <span aria-hidden style={{ fontSize: "0.6rem" }}>
              ▲
            </span>
            {diasAtras}d atrasada
          </span>
          {tarea.prioridad && (
            <Pill
              text={tarea.prioridad}
              bg={tarea.prioridad === "alta" ? T.negBg : T.surfaceSunken}
              fg={tarea.prioridad === "alta" ? T.negText : T.textMuted}
              border={tarea.prioridad === "alta" ? T.negBorder : T.border}
            />
          )}
        </div>
      </div>
      <div className="shrink-0">
        <Button size="sm" onClick={() => onCompletar(tarea)} disabled={pendiente}>
          Completar
        </Button>
      </div>
    </div>
  );
}

/* ── Card de tarea HOY — elevación media ──────────────────────────────── */
function TodayCard({
  tarea,
  onCompletar,
  pendiente,
}: {
  tarea: Tarea;
  onCompletar: (t: Tarea) => void;
  pendiente: boolean;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center justify-between gap-4 overflow-hidden rounded-lg pl-5 pr-4 py-3"
      style={{
        backgroundColor: hover ? T.surfaceSunken : T.surface,
        border: `1px solid ${hover ? T.warnBorder : T.border}`,
        boxShadow: hover ? T.shadowSm : T.shadowXs,
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition: "all 150ms ease",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
        style={{ backgroundColor: T.warnText }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" style={{ color: T.text }}>
          {tarea.titulo}
        </div>
        {tarea.descripcion && (
          <div className="mt-0.5 truncate text-xs" style={{ color: T.textMuted }}>
            {tarea.descripcion}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium" style={{ ...MONO, color: T.warnText }}>
            vence hoy
          </span>
          {tarea.prioridad && (
            <Pill text={tarea.prioridad} bg={T.surfaceSunken} fg={T.textMuted} border={T.border} />
          )}
        </div>
      </div>
      <div className="shrink-0">
        <Button size="sm" variant="outline" onClick={() => onCompletar(tarea)} disabled={pendiente}>
          Completar
        </Button>
      </div>
    </div>
  );
}

/* ── Card de tarea PRÓXIMA — tono apagado ─────────────────────────────── */
function UpcomingCard({
  tarea,
  onCompletar,
  pendiente,
}: {
  tarea: Tarea;
  onCompletar: (t: Tarea) => void;
  pendiente: boolean;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center justify-between gap-4 overflow-hidden rounded-lg pl-5 pr-4 py-2.5"
      style={{
        backgroundColor: hover ? T.surfaceSunken : T.surface,
        border: `1px solid ${T.border}`,
        boxShadow: hover ? T.shadowXs : "none",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition: "all 150ms ease",
        opacity: 0.9,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
        style={{ backgroundColor: T.border }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" style={{ color: T.textMuted, fontWeight: 450 }}>
          {tarea.titulo}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {tarea.vencimiento && (
            <span className="text-[11px]" style={{ ...MONO, color: T.textSubtle }}>
              {etiquetaVencimiento(tarea.vencimiento, "upcoming")}
            </span>
          )}
          {tarea.prioridad && (
            <Pill text={tarea.prioridad} bg={T.surfaceSunken} fg={T.textSubtle} border={T.border} />
          )}
        </div>
      </div>
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => onCompletar(tarea)}
          disabled={pendiente}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 hover:bg-[hsl(var(--surface-sunken))] disabled:opacity-50"
          style={{ color: T.textMuted, border: `1px solid ${T.border}` }}
        >
          Completar
        </button>
      </div>
    </div>
  );
}

/* ── Card de incidente — border completo según severidad ───────────────── */
function IncidenteCard({ inc }: { inc: Incidente }) {
  const [hover, setHover] = useState(false);
  const sevAlta = inc.severidad === "alta";
  const sevMedia = inc.severidad === "media";

  const borderColor = sevAlta ? T.negBorder : sevMedia ? T.warnBorder : T.border;
  const bgColor = sevAlta ? T.negBg : sevMedia ? T.warnBg : T.surface;
  const stripColor = sevAlta ? T.negText : sevMedia ? T.warnText : T.textSubtle;
  const sevTextColor = sevAlta ? T.negText : sevMedia ? T.warnText : T.textMuted;
  const sevBadgeBg = sevAlta ? T.negBg : sevMedia ? T.warnBg : T.surfaceSunken;
  const sevBadgeBorder = sevAlta ? T.negBorder : sevMedia ? T.warnBorder : T.border;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center justify-between gap-4 overflow-hidden rounded-lg pl-5 pr-4 py-3"
      style={{
        backgroundColor: hover
          ? sevAlta
            ? "hsl(var(--neg-bg))"
            : sevMedia
              ? "hsl(var(--warn-bg))"
              : T.surfaceSunken
          : bgColor,
        border: `1px solid ${borderColor}`,
        boxShadow: hover ? (sevAlta ? T.shadowPop : T.shadowSm) : sevAlta ? T.shadowSm : T.shadowXs,
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition: "all 150ms ease",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
        style={{ backgroundColor: stripColor }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" style={{ color: T.text }}>
          {inc.titulo ?? "Incidente sin título"}
        </div>
        {inc.detalle && (
          <div className="mt-0.5 truncate text-xs" style={{ color: T.textMuted }}>
            {inc.detalle}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {inc.severidad && (
            <Pill text={inc.severidad} bg={sevBadgeBg} fg={sevTextColor} border={sevBadgeBorder} />
          )}
          {inc.tipo && <Pill text={inc.tipo} bg={T.infoBg} fg={T.infoText} border={T.infoBorder} />}
        </div>
      </div>
      <div className="shrink-0">
        <a
          href={inc.persona_id ? `/personas/${inc.persona_id}` : undefined}
          aria-disabled={!inc.persona_id}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 hover:underline"
          style={{
            color: inc.persona_id ? T.brand : T.textSubtle,
            opacity: inc.persona_id ? 1 : 0.5,
          }}
        >
          Ver ficha
          <span aria-hidden style={{ fontSize: "0.65rem" }}>
            →
          </span>
        </a>
      </div>
    </div>
  );
}

/* ── Card de prospecto ────────────────────────────────────────────────── */
function ProspectoCard({
  prospecto,
  onPromover,
  pendiente,
}: {
  prospecto: Prospecto;
  onPromover: (p: Prospecto) => void;
  pendiente: boolean;
}) {
  const [hover, setHover] = useState(false);
  const inicial = (prospecto.nombre ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center justify-between gap-4 overflow-hidden rounded-lg pl-5 pr-4 py-3"
      style={{
        backgroundColor: hover ? T.surfaceSunken : T.surface,
        border: `1px solid ${hover ? "hsl(var(--brand-subtle))" : T.border}`,
        boxShadow: hover ? T.shadowSm : T.shadowXs,
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        transition: "all 150ms ease",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
        style={{ backgroundColor: T.brand }}
      />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Avatar inicial */}
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{
            backgroundColor: T.brandSubtle,
            color: T.brand,
            border: `1.5px solid hsl(var(--brand-subtle))`,
          }}
        >
          {inicial}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" style={{ color: T.text }}>
            {prospecto.nombre ?? "Prospecto sin nombre"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {prospecto.telefono && (
              <span className="text-[11px]" style={{ ...MONO, color: T.textSubtle }}>
                {prospecto.telefono}
              </span>
            )}
            <Pill
              text={prospecto.estado}
              bg={T.brandSubtle}
              fg={T.brand}
              border="hsl(var(--brand-subtle))"
            />
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPromover(prospecto)}
          disabled={pendiente}
        >
          Promover
        </Button>
      </div>
    </div>
  );
}

/* ── Skeleton de carga ─────────────────────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-1" aria-busy="true" aria-label="Cargando bandeja">
      {/* Simula el header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div
            className="h-6 w-32 animate-pulse rounded-md"
            style={{ backgroundColor: T.surfaceSunken }}
          />
          <div
            className="h-4 w-48 animate-pulse rounded-md"
            style={{ backgroundColor: T.surfaceSunken, opacity: 0.7 }}
          />
        </div>
      </div>
      {/* Simula el tab bar */}
      <div className="flex gap-1 border-b pb-0" style={{ borderColor: T.border }}>
        {[80, 100, 90].map((w, i) => (
          <div
            key={i}
            className="h-8 animate-pulse rounded-t-md"
            style={{
              width: w,
              backgroundColor: T.surfaceSunken,
              opacity: i === 0 ? 1 : 0.55,
            }}
          />
        ))}
      </div>
      {/* Simula las cards */}
      <div className="space-y-2.5">
        {[1, 0.72, 0.52].map((op, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg"
            style={{
              backgroundColor: T.surfaceSunken,
              opacity: op,
              border: `1px solid ${T.border}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Banner de aviso ───────────────────────────────────────────────────── */
function AvisoBanner({ mensaje, onDismiss }: { mensaje: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between rounded-lg px-4 py-2.5 text-sm"
      style={{
        backgroundColor: T.posBg,
        border: `1px solid ${T.posBorder}`,
        color: T.posText,
      }}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden style={{ fontSize: "0.75rem" }}>
          ✓
        </span>
        {mensaje}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-3 text-xs opacity-60 hover:opacity-100 transition-opacity duration-150"
        aria-label="Cerrar aviso"
        style={{ color: T.posText }}
      >
        ✕
      </button>
    </div>
  );
}

/* ── Hero de urgencia — barra compacta con métricas de prioridad ──────── */
function UrgencyBar({
  vencidas,
  hoy,
  proximas,
}: {
  vencidas: number;
  hoy: number;
  proximas: number;
}) {
  const total = vencidas + hoy + proximas;
  if (total === 0) return null;

  return (
    <div
      className="flex items-center gap-4 rounded-lg px-4 py-2.5"
      style={{
        backgroundColor: vencidas > 0 ? T.negBg : T.warnBg,
        border: `1px solid ${vencidas > 0 ? T.negBorder : T.warnBorder}`,
      }}
    >
      {vencidas > 0 && (
        <span
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: T.negText }}
        >
          <span aria-hidden style={{ ...MONO, fontSize: "0.7rem" }}>
            ▲
          </span>
          <span style={MONO}>{vencidas} vencidas</span>
        </span>
      )}
      {hoy > 0 && (
        <span
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: T.warnText }}
        >
          <span style={MONO}>{hoy}</span>
          <span style={{ fontFamily: "inherit" }}>para hoy</span>
        </span>
      )}
      {proximas > 0 && (
        <span className="flex items-center gap-1.5 text-xs" style={{ color: T.textMuted }}>
          <span style={MONO}>{proximas}</span>
          <span style={{ fontFamily: "inherit" }}>próximas</span>
        </span>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * InboxPage — bandeja de trabajo priorizada con tres pestañas.
 * Inbox-driven: el operador ve qué resolver hoy, no una tabla plana.
 * ════════════════════════════════════════════════════════════════════════ */
export function InboxPage() {
  const tareasQ = useTareas();
  const incidentesQ = useIncidentes();
  const prospectosQ = useProspectos();
  const completar = useCompletarTarea();
  const promover = usePromoverProspecto();
  const [aviso, setAviso] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("tareas");

  /* ── Loading state ──────────────────────────────────────────────────── */
  if (tareasQ.isLoading) return <LoadingSkeleton />;

  /* ── Error state ────────────────────────────────────────────────────── */
  if (tareasQ.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-lg p-4"
        style={{
          backgroundColor: T.negBg,
          border: `1px solid ${T.negBorder}`,
        }}
      >
        <p className="text-sm font-medium" style={{ color: T.negText }}>
          No se pudieron cargar las tareas.
        </p>
        <button
          type="button"
          onClick={() => tareasQ.refetch()}
          className="self-start rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 hover:opacity-80"
          style={{
            color: T.negText,
            backgroundColor: T.surface,
            border: `1px solid ${T.negBorder}`,
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  /* ── Datos derivados ────────────────────────────────────────────────── */
  const tareas = tareasQ.data?.data ?? [];
  const incidentes = (incidentesQ.data?.data ?? []).filter((i) => i.estado === "abierto");
  const prospectos = (prospectosQ.data?.data ?? []).filter((p) => p.estado !== "convertido");
  const { vencidas, hoy, proximas } = clasificar(tareas);
  const totalPendiente = vencidas.length + hoy.length + proximas.length;

  /* ── Handlers ────────────────────────────────────────────────────────── */
  const completarTarea = async (t: Tarea) => {
    await completar.mutateAsync({ id: t.id, detalle: "Gestión registrada" });
    setAviso("Tarea completada · interacción registrada.");
  };

  const promoverProspecto = async (p: Prospecto) => {
    await promover.mutateAsync(p.id);
    setAviso(`Prospecto ${p.nombre ?? ""} promovido a cliente.`);
  };

  const tabs: TabDef[] = [
    { id: "tareas", label: "Tareas", count: totalPendiente },
    { id: "incidentes", label: "Incidentes", count: incidentes.length },
    { id: "prospectos", label: "Prospectos", count: prospectos.length },
  ];

  return (
    <div className="space-y-4">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: T.text }}>
            Mi inbox
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: T.textMuted }}>
            {totalPendiente === 0 ? (
              "Estás al día — sin tareas pendientes."
            ) : (
              <>
                <span style={{ ...MONO, color: T.text }}>{totalPendiente}</span>
                {" tareas pendientes"}
              </>
            )}
          </p>
        </div>
      </header>

      {/* ── Barra de urgencia (solo tareas) ──────────────────────────── */}
      {tab === "tareas" && totalPendiente > 0 && (
        <UrgencyBar vencidas={vencidas.length} hoy={hoy.length} proximas={proximas.length} />
      )}

      {/* ── Aviso de éxito ───────────────────────────────────────────── */}
      {aviso && <AvisoBanner mensaje={aviso} onDismiss={() => setAviso(null)} />}

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />

      {/* ═══════════════════════════════════════════════════════════════
       * PANEL: TAREAS
       * Tres secciones con jerarquía visual explícita:
       *   vencidas > hoy > próximas
       * ═════════════════════════════════════════════════════════════ */}
      {tab === "tareas" && (
        <div role="tabpanel" className="space-y-6">
          {/* Sección vencidas — peso máximo */}
          <section>
            <SectionHeader label="Vencidas" count={vencidas.length} accentColor={T.negText} />
            {vencidas.length === 0 ? (
              <EmptyState glyph="✓" title="Nada vencido" hint="Vas al día con tus plazos." />
            ) : (
              <ul className="space-y-2">
                {vencidas.map((t) => (
                  <li key={t.id}>
                    <OverdueCard
                      tarea={t}
                      onCompletar={completarTarea}
                      pendiente={completar.isPending}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sección hoy — peso medio */}
          <section>
            <SectionHeader label="Para hoy" count={hoy.length} accentColor={T.warnText} />
            {hoy.length === 0 ? (
              <EmptyState glyph="—" title="Sin tareas para hoy" hint="Tu jornada está despejada." />
            ) : (
              <ul className="space-y-2">
                {hoy.map((t) => (
                  <li key={t.id}>
                    <TodayCard
                      tarea={t}
                      onCompletar={completarTarea}
                      pendiente={completar.isPending}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sección próximas — peso bajo */}
          <section>
            <SectionHeader
              label="Próximas"
              count={proximas.length}
              accentColor={T.textSubtle}
              dimmed
            />
            {proximas.length === 0 ? (
              <EmptyState glyph="·" title="Sin tareas próximas" hint="Nada agendado por ahora." />
            ) : (
              <ul className="space-y-1.5">
                {proximas.map((t) => (
                  <li key={t.id}>
                    <UpcomingCard
                      tarea={t}
                      onCompletar={completarTarea}
                      pendiente={completar.isPending}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
       * PANEL: INCIDENTES
       * Border color completo = severidad (no solo el strip)
       * ═════════════════════════════════════════════════════════════ */}
      {tab === "incidentes" && (
        <div role="tabpanel">
          <SectionHeader label="Abiertos" count={incidentes.length} accentColor={T.negText} />
          {incidentes.length === 0 ? (
            <EmptyState
              glyph="○"
              title="Sin incidentes abiertos"
              hint="No hay casos que atender."
            />
          ) : (
            <ul className="space-y-2">
              {incidentes.map((i) => (
                <li key={i.id}>
                  <IncidenteCard inc={i} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
       * PANEL: PROSPECTOS
       * ═════════════════════════════════════════════════════════════ */}
      {tab === "prospectos" && (
        <div role="tabpanel">
          <SectionHeader label="Pipeline" count={prospectos.length} accentColor={T.brand} />
          {prospectos.length === 0 ? (
            <EmptyState glyph="+" title="Sin prospectos" hint="Aún no hay leads en el pipeline." />
          ) : (
            <ul className="space-y-2">
              {prospectos.map((p) => (
                <li key={p.id}>
                  <ProspectoCard
                    prospecto={p}
                    onPromover={promoverProspecto}
                    pendiente={promover.isPending}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
