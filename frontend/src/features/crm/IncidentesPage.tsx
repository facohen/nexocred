import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { useIncidentes, useCrearIncidente } from "./hooks";
import type { components } from "@/lib/api/schema";
import { T, MONO } from "./ui-tokens";
import {
  Pill,
  SectionHeader,
  EmptyState,
  AvisoBanner,
  ErrorState,
  ListSkeleton,
} from "./ui-primitives";

type Incidente = components["schemas"]["IncidenteOut"];

/* ── Modelo de severidad ───────────────────────────────────────────────
 * Tres niveles dictan el peso visual completo (no sólo un badge):
 *   critica/alta → neg (rojo), domina la composición
 *   media        → warn (ámbar)
 *   baja/otro    → neutral, peso mínimo
 * ──────────────────────────────────────────────────────────────────── */
type Nivel = "critica" | "media" | "baja";

interface SevTheme {
  nivel: Nivel;
  rank: number;
  strip: string;
  border: string;
  bg: string;
  bgHover: string;
  badgeFg: string;
  badgeBg: string;
  badgeBorder: string;
  shadow: string;
  shadowHover: string;
  headerLabel: string;
}

function clasificarSeveridad(sev: string | null | undefined): Nivel {
  const s = (sev ?? "").toLowerCase();
  if (s === "critica" || s === "crítica" || s === "alta") return "critica";
  if (s === "media") return "media";
  return "baja";
}

const THEMES: Record<Nivel, SevTheme> = {
  critica: {
    nivel: "critica",
    rank: 0,
    strip: T.negText,
    border: T.negBorder,
    bg: T.negBg,
    bgHover: T.negBg,
    badgeFg: T.negText,
    badgeBg: T.negBg,
    badgeBorder: T.negBorder,
    shadow: T.shadowSm,
    shadowHover: T.shadowPop,
    headerLabel: "Crítica · alta",
  },
  media: {
    nivel: "media",
    rank: 1,
    strip: T.warnText,
    border: T.warnBorder,
    bg: T.surface,
    bgHover: T.warnBg,
    badgeFg: T.warnText,
    badgeBg: T.warnBg,
    badgeBorder: T.warnBorder,
    shadow: T.shadowXs,
    shadowHover: T.shadowSm,
    headerLabel: "Media",
  },
  baja: {
    nivel: "baja",
    rank: 2,
    strip: T.textSubtle,
    border: T.border,
    bg: T.surface,
    bgHover: T.surfaceSunken,
    badgeFg: T.textMuted,
    badgeBg: T.surfaceSunken,
    badgeBorder: T.border,
    shadow: "none",
    shadowHover: T.shadowXs,
    headerLabel: "Baja",
  },
};

/* Días abiertos: el id uuid v4 no codifica fecha, así que cuando no hay
 * timestamp confiable mostramos un guion en vez de inventar un número. */
function diasAbierto(_inc: Incidente): number | null {
  return null;
}

/* ── Card de incidente: el peso visual lo dicta la severidad ──────────── */
function IncidenteCard({ inc }: { inc: Incidente }) {
  const [hover, setHover] = useState(false);
  const nivel = clasificarSeveridad(inc.severidad);
  const th = THEMES[nivel];
  const critico = nivel === "critica";
  const dias = diasAbierto(inc);
  const resuelto = inc.estado !== "abierto";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-stretch gap-4 overflow-hidden rounded-xl pl-5 pr-4 py-3.5"
      style={{
        backgroundColor: hover ? th.bgHover : th.bg,
        border: `1px solid ${th.border}`,
        boxShadow: hover ? th.shadowHover : th.shadow,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "all 150ms ease",
        opacity: resuelto ? 0.72 : 1,
      }}
    >
      {/* Strip de severidad — 4px */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
        style={{ backgroundColor: th.strip }}
      />

      {/* Columna central: título + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {inc.severidad && (
            <Pill text={inc.severidad} bg={th.badgeBg} fg={th.badgeFg} border={th.badgeBorder} />
          )}
          {inc.tipo && <Pill text={inc.tipo} bg={T.infoBg} fg={T.infoText} border={T.infoBorder} />}
          {resuelto && <Pill text={inc.estado} bg={T.posBg} fg={T.posText} border={T.posBorder} />}
        </div>
        <div className="mt-1.5 truncate text-sm font-semibold" style={{ color: T.text }}>
          {inc.titulo ?? "Incidente sin título"}
        </div>
        {inc.detalle && (
          <div className="mt-0.5 truncate text-xs" style={{ color: T.textMuted }}>
            {inc.detalle}
          </div>
        )}
        <div className="mt-2 flex items-center gap-3">
          <span className="flex items-center gap-1 text-[11px]" style={{ color: T.textSubtle }}>
            <span aria-hidden>·</span>
            entidad afectada
            <span style={{ ...MONO, color: inc.persona_id ? T.textMuted : T.textSubtle }}>
              {inc.persona_id ? `#${inc.persona_id.slice(0, 8)}` : "sin asignar"}
            </span>
          </span>
        </div>
      </div>

      {/* Columna derecha: días-abierto en mono + acción */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <div className="flex flex-col items-end leading-none">
          <span
            className="text-lg font-bold tabular-nums"
            style={{ ...MONO, color: critico ? T.negText : T.text }}
          >
            {dias ?? "—"}
          </span>
          <span
            className="mt-0.5 text-[10px] uppercase"
            style={{ color: T.textSubtle, letterSpacing: "0.06em" }}
          >
            días abierto
          </span>
        </div>
        <a
          href={inc.persona_id ? `/personas/${inc.persona_id}` : undefined}
          aria-disabled={!inc.persona_id}
          className="inline-flex items-center gap-1 text-xs font-medium transition-all duration-150 hover:underline"
          style={{
            color: inc.persona_id ? T.brand : T.textSubtle,
            opacity: inc.persona_id ? 1 : 0.5,
            pointerEvents: inc.persona_id ? "auto" : "none",
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

/* ── Grupo por severidad con header y conteo ──────────────────────────── */
function SeveridadGrupo({ th, items }: { th: SevTheme; items: Incidente[] }) {
  if (items.length === 0) return null;
  const critico = th.nivel === "critica";
  return (
    <section>
      <SectionHeader
        label={th.headerLabel}
        count={items.length}
        accentColor={th.strip}
        countFg={critico ? T.negText : th.nivel === "media" ? T.warnText : T.textMuted}
        countBg={critico ? T.negBg : th.nivel === "media" ? T.warnBg : T.surfaceSunken}
        countBorder={th.border}
      />
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id}>
            <IncidenteCard inc={i} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Incidentes del operador — agrupados por severidad, peso visual creciente. */
export function IncidentesPage() {
  const q = useIncidentes();
  const crear = useCrearIncidente();
  const [titulo, setTitulo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  if (q.isLoading) return <ListSkeleton label="Cargando incidentes" />;
  if (q.isError) {
    return (
      <ErrorState mensaje="No se pudieron cargar los incidentes." onRetry={() => q.refetch()} />
    );
  }

  const incidentes = q.data?.data ?? [];

  /* Orden: críticas primero, luego media, luego baja. Estable dentro de cada nivel. */
  const grupos: Record<Nivel, Incidente[]> = { critica: [], media: [], baja: [] };
  for (const inc of incidentes) {
    grupos[clasificarSeveridad(inc.severidad)].push(inc);
  }

  const abiertos = incidentes.filter((i) => i.estado === "abierto").length;
  const criticos = grupos.critica.filter((i) => i.estado === "abierto").length;

  const crearIncidente = async () => {
    await crear.mutateAsync({
      titulo,
      tipo: "queja",
      severidad: "media",
      persona_id: null,
      detalle: null,
      operador_id: null,
    });
    setTitulo("");
    setAviso("Incidente creado.");
  };

  return (
    <div className="space-y-4">
      {/* ── Header con pulso de severidad ──────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: T.text }}>
            Incidentes
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: T.textMuted }}>
            {incidentes.length === 0 ? (
              "Sin incidentes registrados."
            ) : (
              <>
                <span style={{ ...MONO, color: T.text }}>{abiertos}</span>
                {" abiertos"}
                {criticos > 0 && (
                  <>
                    {" · "}
                    <span style={{ ...MONO, color: T.negText, fontWeight: 600 }}>{criticos}</span>
                    <span style={{ color: T.negText }}> críticos</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </header>

      {/* ── Alta rápida ────────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-4"
        style={{
          backgroundColor: T.surface,
          border: `1px solid ${T.border}`,
          boxShadow: T.shadowXs,
        }}
      >
        <div className="mb-3 flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-0.5 rounded-full"
            style={{ backgroundColor: T.brand }}
          />
          <h2
            className="text-xs font-semibold uppercase"
            style={{ color: T.textMuted, letterSpacing: "0.08em" }}
          >
            Registrar incidente
          </h2>
        </div>
        <div className="flex items-end gap-2">
          <FormField
            label="Título"
            name="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="flex-1"
          />
          <Button onClick={crearIncidente} disabled={!titulo || crear.isPending}>
            Crear incidente
          </Button>
        </div>
        {aviso && (
          <div className="mt-3">
            <AvisoBanner mensaje={aviso} onDismiss={() => setAviso(null)} />
          </div>
        )}
      </div>

      {/* ── Grupos por severidad ───────────────────────────────────────── */}
      {incidentes.length === 0 ? (
        <EmptyState
          glyph="○"
          title="Sin incidentes"
          hint="Cuando se registre un caso, aparecerá priorizado por severidad."
        />
      ) : (
        <div className="space-y-6">
          <SeveridadGrupo th={THEMES.critica} items={grupos.critica} />
          <SeveridadGrupo th={THEMES.media} items={grupos.media} />
          <SeveridadGrupo th={THEMES.baja} items={grupos.baja} />
        </div>
      )}
    </div>
  );
}
