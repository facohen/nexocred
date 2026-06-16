import { useState, type CSSProperties, type ReactNode } from "react";
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
 * Tokens. El sistema de diseño guarda los colores como canales HSL crudos
 * (ej. --neg: "352 75% 47%"), por eso se envuelven en hsl(var(--token)).
 * Solo se usan variables CSS — ningún hex/rgb literal, ningún color Tailwind.
 * ──────────────────────────────────────────────────────────────────────── */
const TOKEN = {
  brand: "hsl(var(--brand))",
  brandSubtle: "hsl(var(--brand-subtle))",
  surface: "hsl(var(--surface))",
  surfacePop: "hsl(var(--surface-sunken))",
  border: "hsl(var(--border))",
  borderStrong: "hsl(var(--border-strong))",
  text: "hsl(var(--text))",
  textMuted: "hsl(var(--text-muted))",
  textSubtle: "hsl(var(--text-subtle))",
  negText: "hsl(var(--neg))",
  negBorder: "hsl(var(--neg-border))",
  negBg: "hsl(var(--neg-bg))",
  warnText: "hsl(var(--warn))",
  warnBorder: "hsl(var(--warn-border))",
  warnBg: "hsl(var(--warn-bg))",
  infoText: "hsl(var(--info))",
  infoBg: "hsl(var(--info-bg))",
  infoBorder: "hsl(var(--info-border))",
  shadowPop: "var(--shadow-pop)",
} as const;

const MONO: CSSProperties = { fontFamily: "'Geist Mono', monospace" };

/** Clasifica una tarea pendiente por urgencia según su vencimiento. */
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

/** Días entre hoy y una fecha ISO (negativo = atrasada). */
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
      className="flex items-center gap-1"
      style={{ borderBottom: `1px solid ${TOKEN.border}` }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className="group relative -mb-px flex items-center gap-2 px-3 py-2.5 text-sm font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-0"
            style={{
              color: isActive ? TOKEN.text : TOKEN.textMuted,
              borderBottom: `2px solid ${isActive ? TOKEN.brand : "transparent"}`,
            }}
          >
            <span className="transition-colors duration-150 group-hover:text-[color:hsl(var(--text))]">
              {tab.label}
            </span>
            <span
              className="inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none transition-all duration-150"
              style={{
                ...MONO,
                color: isActive ? TOKEN.brand : TOKEN.textSubtle,
                backgroundColor: isActive ? TOKEN.brandSubtle : TOKEN.surfacePop,
              }}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Card genérica con strip de prioridad a la izquierda ──────────────── */
function PriorityCard({
  stripColor,
  children,
  emphasis = false,
}: {
  stripColor: string;
  children: ReactNode;
  emphasis?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg pl-4 pr-3.5 py-3 transition-all duration-150"
      style={{
        backgroundColor: hover ? TOKEN.surfacePop : TOKEN.surface,
        border: `1px solid ${emphasis ? TOKEN.borderStrong : TOKEN.border}`,
        boxShadow: hover ? TOKEN.shadowPop : "var(--shadow-xs)",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg"
        style={{ backgroundColor: stripColor }}
      />
      {children}
    </div>
  );
}

/* ── Pill semántica (badge) ───────────────────────────────────────────── */
function Pill({ text, bg, fg, border }: { text: string; bg: string; fg: string; border?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none"
      style={{ backgroundColor: bg, color: fg, border: `1px solid ${border ?? "transparent"}` }}
    >
      {text}
    </span>
  );
}

/* ── Empty state con personalidad ─────────────────────────────────────── */
function EmptyState({ glyph, title, hint }: { glyph: string; title: string; hint: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 rounded-lg px-6 py-12 text-center"
      style={{
        border: `1px dashed ${TOKEN.border}`,
        backgroundColor: TOKEN.surfacePop,
      }}
    >
      <span aria-hidden className="text-2xl" style={{ ...MONO, color: TOKEN.textSubtle }}>
        {glyph}
      </span>
      <p className="text-sm font-medium" style={{ color: TOKEN.text }}>
        {title}
      </p>
      <p className="text-xs" style={{ color: TOKEN.textSubtle }}>
        {hint}
      </p>
    </div>
  );
}

/* ── Encabezado de grupo (sección de tareas) ──────────────────────────── */
function GroupHeader({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
      <h2
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: TOKEN.textMuted }}
      >
        {label}
      </h2>
      <span
        className="inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none"
        style={{ ...MONO, color: TOKEN.textSubtle, backgroundColor: TOKEN.surfacePop }}
      >
        {count}
      </span>
    </div>
  );
}

/* ── Fila de tarea ────────────────────────────────────────────────────── */
function TareaRow({
  tarea,
  urgencia,
  onCompletar,
  pendiente,
}: {
  tarea: Tarea;
  urgencia: Urgencia;
  onCompletar: (t: Tarea) => void;
  pendiente: boolean;
}) {
  const stripColor =
    urgencia === "overdue"
      ? TOKEN.negBorder
      : urgencia === "today"
        ? TOKEN.warnBorder
        : TOKEN.border;
  const fechaColor =
    urgencia === "overdue"
      ? TOKEN.negText
      : urgencia === "today"
        ? TOKEN.warnText
        : TOKEN.textSubtle;
  const esAlta = tarea.prioridad === "alta";

  return (
    <PriorityCard stripColor={stripColor} emphasis={urgencia === "overdue"}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" style={{ color: TOKEN.text }}>
          {tarea.titulo}
        </div>
        {tarea.descripcion && (
          <div className="truncate text-xs" style={{ color: TOKEN.textMuted }}>
            {tarea.descripcion}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {tarea.prioridad && (
            <Pill
              text={tarea.prioridad}
              bg={esAlta ? TOKEN.negBg : TOKEN.surfacePop}
              fg={esAlta ? TOKEN.negText : TOKEN.textMuted}
              border={esAlta ? TOKEN.negBorder : TOKEN.border}
            />
          )}
          {tarea.vencimiento && (
            <span
              className="text-[11px] font-medium"
              style={{ ...MONO, color: fechaColor }}
              title={tarea.vencimiento.slice(0, 10)}
            >
              {etiquetaVencimiento(tarea.vencimiento, urgencia)}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        <Button size="sm" onClick={() => onCompletar(tarea)} disabled={pendiente}>
          Completar
        </Button>
      </div>
    </PriorityCard>
  );
}

/* ── Fila de incidente ────────────────────────────────────────────────── */
function severidadStrip(sev?: string | null): string {
  if (sev === "alta") return TOKEN.negBorder;
  if (sev === "media") return TOKEN.warnBorder;
  return TOKEN.border;
}

function IncidenteRow({ inc }: { inc: Incidente }) {
  const sevAlta = inc.severidad === "alta";
  const sevColor = sevAlta
    ? TOKEN.negText
    : inc.severidad === "media"
      ? TOKEN.warnText
      : TOKEN.textMuted;
  const sevBg = sevAlta ? TOKEN.negBg : inc.severidad === "media" ? TOKEN.warnBg : TOKEN.surfacePop;
  const sevBorder = sevAlta
    ? TOKEN.negBorder
    : inc.severidad === "media"
      ? TOKEN.warnBorder
      : TOKEN.border;
  return (
    <PriorityCard stripColor={severidadStrip(inc.severidad)} emphasis={sevAlta}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" style={{ color: TOKEN.text }}>
          {inc.titulo ?? "Incidente sin título"}
        </div>
        {inc.detalle && (
          <div className="truncate text-xs" style={{ color: TOKEN.textMuted }}>
            {inc.detalle}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {inc.tipo && (
            <Pill text={inc.tipo} bg={TOKEN.infoBg} fg={TOKEN.infoText} border={TOKEN.infoBorder} />
          )}
          {inc.severidad && (
            <Pill text={inc.severidad} bg={sevBg} fg={sevColor} border={sevBorder} />
          )}
        </div>
      </div>
      <div className="shrink-0">
        <a
          href={inc.persona_id ? `/personas/${inc.persona_id}` : undefined}
          aria-disabled={!inc.persona_id}
          className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150"
          style={{ color: inc.persona_id ? TOKEN.brand : TOKEN.textSubtle }}
        >
          Ver ficha →
        </a>
      </div>
    </PriorityCard>
  );
}

/* ── Fila de prospecto ────────────────────────────────────────────────── */
function ProspectoRow({
  prospecto,
  onPromover,
  pendiente,
}: {
  prospecto: Prospecto;
  onPromover: (p: Prospecto) => void;
  pendiente: boolean;
}) {
  const inicial = (prospecto.nombre ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <PriorityCard stripColor={TOKEN.brand}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: TOKEN.brandSubtle, color: TOKEN.brand }}
        >
          {inicial}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" style={{ color: TOKEN.text }}>
            {prospecto.nombre ?? "Prospecto sin nombre"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {prospecto.telefono && (
              <span className="text-[11px]" style={{ ...MONO, color: TOKEN.textSubtle }}>
                {prospecto.telefono}
              </span>
            )}
            <Pill
              text={prospecto.estado}
              bg={TOKEN.brandSubtle}
              fg={TOKEN.brand}
              border={TOKEN.border}
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
    </PriorityCard>
  );
}

/**
 * Inbox del operador — bandeja de trabajo priorizada con tres pestañas:
 * tareas (vencidas / hoy / próximas), incidentes abiertos y prospectos.
 * Patrón inbox-driven: el operador ve qué resolver hoy, no una tabla.
 */
export function InboxPage() {
  const tareasQ = useTareas();
  const incidentesQ = useIncidentes();
  const prospectosQ = useProspectos();
  const completar = useCompletarTarea();
  const promover = usePromoverProspecto();
  const [aviso, setAviso] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("tareas");

  if (tareasQ.isLoading) {
    return (
      <div className="space-y-3 p-1">
        <div
          className="h-7 w-40 animate-pulse rounded-md"
          style={{ backgroundColor: TOKEN.surfacePop }}
        />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg"
            style={{ backgroundColor: TOKEN.surfacePop, opacity: 1 - i * 0.18 }}
          />
        ))}
      </div>
    );
  }

  if (tareasQ.isError) {
    return (
      <div
        role="alert"
        className="m-1 flex flex-col gap-1 rounded-lg p-4"
        style={{ backgroundColor: TOKEN.negBg, border: `1px solid ${TOKEN.negBorder}` }}
      >
        <p className="text-sm font-medium" style={{ color: TOKEN.negText }}>
          No se pudieron cargar las tareas.
        </p>
        <button
          type="button"
          onClick={() => tareasQ.refetch()}
          className="self-start text-xs font-medium underline-offset-2 hover:underline"
          style={{ color: TOKEN.negText }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const tareas = tareasQ.data?.data ?? [];
  const incidentes = (incidentesQ.data?.data ?? []).filter((i) => i.estado === "abierto");
  const prospectos = (prospectosQ.data?.data ?? []).filter((p) => p.estado !== "convertido");
  const { vencidas, hoy, proximas } = clasificar(tareas);
  const totalPendiente = vencidas.length + hoy.length + proximas.length;

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

  const grupos: {
    key: Urgencia;
    label: string;
    items: Tarea[];
    accent: string;
    empty: ReactNode;
  }[] = [
    {
      key: "overdue",
      label: "Vencidas",
      items: vencidas,
      accent: TOKEN.negText,
      empty: <EmptyState glyph="✓" title="Nada vencido" hint="Vas al día con tus plazos." />,
    },
    {
      key: "today",
      label: "Para hoy",
      items: hoy,
      accent: TOKEN.warnText,
      empty: <EmptyState glyph="—" title="Sin tareas para hoy" hint="Tu jornada está despejada." />,
    },
    {
      key: "upcoming",
      label: "Próximas",
      items: proximas,
      accent: TOKEN.textSubtle,
      empty: <EmptyState glyph="·" title="Sin tareas próximas" hint="Nada agendado por ahora." />,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: TOKEN.text }}>
            Mi inbox
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: TOKEN.textMuted }}>
            {totalPendiente === 0 ? (
              "Estás al día — sin tareas pendientes."
            ) : (
              <>
                <span style={{ ...MONO, color: TOKEN.text }}>{`${totalPendiente} `}</span>
                tareas pendientes
                {vencidas.length > 0 && (
                  <span
                    style={{ ...MONO, color: TOKEN.negText }}
                  >{` · ${vencidas.length} vencidas`}</span>
                )}
              </>
            )}
          </p>
        </div>
      </header>

      {aviso && (
        <p
          className="rounded-md px-3 py-2 text-sm"
          style={{
            backgroundColor: "hsl(var(--pos-bg))",
            color: "hsl(var(--pos))",
            border: "1px solid hsl(var(--pos-border))",
          }}
        >
          {aviso}
        </p>
      )}

      <TabBar tabs={tabs} active={tab} onSelect={setTab} />

      {/* Panel: Tareas */}
      {tab === "tareas" && (
        <div role="tabpanel" className="space-y-6">
          {grupos.map((g) => (
            <section key={g.key}>
              <GroupHeader label={g.label} count={g.items.length} accent={g.accent} />
              {g.items.length === 0 ? (
                g.empty
              ) : (
                <ul className="space-y-2">
                  {g.items.map((t) => (
                    <li key={t.id}>
                      <TareaRow
                        tarea={t}
                        urgencia={g.key}
                        onCompletar={completarTarea}
                        pendiente={completar.isPending}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Panel: Incidentes */}
      {tab === "incidentes" && (
        <div role="tabpanel">
          <GroupHeader label="Abiertos" count={incidentes.length} accent={TOKEN.negText} />
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
                  <IncidenteRow inc={i} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Panel: Prospectos */}
      {tab === "prospectos" && (
        <div role="tabpanel">
          <GroupHeader label="Pipeline" count={prospectos.length} accent={TOKEN.brand} />
          {prospectos.length === 0 ? (
            <EmptyState glyph="+" title="Sin prospectos" hint="Aún no hay leads en el pipeline." />
          ) : (
            <ul className="space-y-2">
              {prospectos.map((p) => (
                <li key={p.id}>
                  <ProspectoRow
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
