import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProspectos, usePromoverProspecto } from "./hooks";
import type { components } from "@/lib/api/schema";
import { T, MONO, iniciales } from "./ui-tokens";
import { Avatar, AvisoBanner, ErrorState, ListSkeleton, CountChip } from "./ui-primitives";

type Prospecto = components["schemas"]["ProspectoOut"];

/* ── Etapas del pipeline ───────────────────────────────────────────────
 * Embudo: contactado → interesado → calificado → convertido.
 * Cada etapa tiene intención de color creciente hacia el verde de cierre. */
type Etapa = "contactado" | "interesado" | "calificado" | "convertido" | "otro";

interface EtapaTheme {
  etapa: Etapa;
  label: string;
  order: number;
  accent: string;
  badgeFg: string;
  badgeBg: string;
  badgeBorder: string;
}

function clasificarEtapa(estado: string | null | undefined): Etapa {
  const s = (estado ?? "").toLowerCase();
  if (s === "contactado") return "contactado";
  if (s === "interesado") return "interesado";
  if (s === "calificado") return "calificado";
  if (s === "convertido") return "convertido";
  return "otro";
}

const ETAPAS: Record<Etapa, EtapaTheme> = {
  contactado: {
    etapa: "contactado",
    label: "Contactado",
    order: 0,
    accent: T.infoText,
    badgeFg: T.infoText,
    badgeBg: T.infoBg,
    badgeBorder: T.infoBorder,
  },
  interesado: {
    etapa: "interesado",
    label: "Interesado",
    order: 1,
    accent: T.brand,
    badgeFg: T.brand,
    badgeBg: T.brandSubtle,
    badgeBorder: T.brandBorder,
  },
  calificado: {
    etapa: "calificado",
    label: "Calificado",
    order: 2,
    accent: T.warnText,
    badgeFg: T.warnText,
    badgeBg: T.warnBg,
    badgeBorder: T.warnBorder,
  },
  convertido: {
    etapa: "convertido",
    label: "Convertido",
    order: 3,
    accent: T.posText,
    badgeFg: T.posText,
    badgeBg: T.posBg,
    badgeBorder: T.posBorder,
  },
  otro: {
    etapa: "otro",
    label: "Sin etapa",
    order: 4,
    accent: T.textSubtle,
    badgeFg: T.textMuted,
    badgeBg: T.surfaceSunken,
    badgeBorder: T.border,
  },
};

/* Orden de etapas visibles en el embudo (excluye "otro" si está vacío). */
const ORDEN_EMBUDO: Etapa[] = ["contactado", "interesado", "calificado", "convertido"];

/* ── Embudo visual: una fila por etapa con ancho proporcional ─────────── */
function Funnel({
  conteos,
  total,
  active,
  onSelect,
}: {
  conteos: Record<Etapa, number>;
  total: number;
  active: Etapa | "todos";
  onSelect: (e: Etapa | "todos") => void;
}) {
  const maxCount = Math.max(1, ...ORDEN_EMBUDO.map((e) => conteos[e]));
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadowXs }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-0.5 rounded-full"
            style={{ backgroundColor: T.brand }}
          />
          <h2
            className="text-xs font-semibold uppercase"
            style={{ color: T.textMuted, letterSpacing: "0.08em" }}
          >
            Embudo
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onSelect("todos")}
          className="text-[11px] font-medium transition-colors duration-150"
          style={{ color: active === "todos" ? T.brand : T.textSubtle }}
        >
          ver todos
        </button>
      </div>
      <div className="space-y-2">
        {ORDEN_EMBUDO.map((e) => {
          const th = ETAPAS[e];
          const n = conteos[e];
          const pct = n / maxCount;
          const isActive = active === e;
          const conv = total > 0 ? Math.round((n / total) * 100) : 0;
          return (
            <button
              key={e}
              type="button"
              onClick={() => onSelect(isActive ? "todos" : e)}
              className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150"
              style={{
                backgroundColor: isActive ? T.surfaceSunken : "transparent",
                border: `1px solid ${isActive ? th.badgeBorder : "transparent"}`,
              }}
            >
              <span
                className="w-20 shrink-0 text-xs font-medium"
                style={{ color: isActive ? th.badgeFg : T.textMuted }}
              >
                {th.label}
              </span>
              <span
                className="relative h-6 flex-1 overflow-hidden rounded-md"
                style={{ backgroundColor: T.surfaceSunken }}
              >
                <span
                  className="absolute inset-y-0 left-0 origin-left rounded-md"
                  style={{
                    width: "100%",
                    backgroundColor: th.accent,
                    opacity: isActive ? 0.9 : 0.55,
                    transform: `scaleX(${Math.max(0.04, pct)})`,
                    transition: "transform 350ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease",
                  }}
                />
              </span>
              <span
                className="w-7 shrink-0 text-right text-sm font-bold tabular-nums"
                style={{ ...MONO, color: th.badgeFg }}
              >
                {n}
              </span>
              <span
                className="w-9 shrink-0 text-right text-[11px] tabular-nums"
                style={{ ...MONO, color: T.textSubtle }}
              >
                {conv}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Monto potencial: derivado determinista del id (no hay campo real) ──
 * Sin campo de monto en el schema, lo dejamos como rango cualitativo
 * de "intención" estimado por etapa, mostrado en mono. */
function intencionPorEtapa(etapa: Etapa): { label: string; fg: string } {
  switch (etapa) {
    case "calificado":
      return { label: "alta", fg: T.posText };
    case "interesado":
      return { label: "media", fg: T.warnText };
    case "convertido":
      return { label: "cerrada", fg: T.posText };
    case "contactado":
      return { label: "inicial", fg: T.infoText };
    default:
      return { label: "—", fg: T.textSubtle };
  }
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
  const etapa = clasificarEtapa(prospecto.estado);
  const th = ETAPAS[etapa];
  const convertido = etapa === "convertido";
  const intencion = intencionPorEtapa(etapa);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center gap-3 overflow-hidden rounded-xl pl-5 pr-4 py-3"
      style={{
        backgroundColor: hover ? T.surfaceSunken : T.surface,
        border: `1px solid ${hover ? th.badgeBorder : T.border}`,
        boxShadow: hover ? T.shadowSm : T.shadowXs,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "all 150ms ease",
        opacity: convertido ? 0.8 : 1,
      }}
    >
      {/* Strip de etapa — 4px, intención de color */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
        style={{ backgroundColor: th.accent }}
      />

      <Avatar initials={iniciales(prospecto.nombre)} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold" style={{ color: T.text }}>
            {prospecto.nombre ?? "Prospecto sin nombre"}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-px text-[10px] font-medium uppercase leading-none"
            style={{
              color: th.badgeFg,
              backgroundColor: th.badgeBg,
              border: `1px solid ${th.badgeBorder}`,
              letterSpacing: "0.04em",
            }}
          >
            {prospecto.estado}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {prospecto.telefono && (
            <span
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ ...MONO, color: T.textSubtle }}
            >
              <span aria-hidden style={{ fontSize: "0.65rem" }}>
                ☏
              </span>
              {prospecto.telefono}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: T.textSubtle }}
          >
            intención
            <span style={{ ...MONO, color: intencion.fg, fontWeight: 600 }}>{intencion.label}</span>
          </span>
        </div>
      </div>

      <div className="shrink-0">
        {convertido ? (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium"
            style={{
              color: T.posText,
              backgroundColor: T.posBg,
              border: `1px solid ${T.posBorder}`,
            }}
          >
            <span aria-hidden style={{ fontSize: "0.7rem" }}>
              ✓
            </span>
            cliente
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPromover(prospecto)}
            disabled={pendiente}
          >
            Promover
          </Button>
        )}
      </div>
    </div>
  );
}

/** Pipeline de prospectos con embudo por etapa y promoción a cliente. */
export function ProspectosPage() {
  const q = useProspectos();
  const promover = usePromoverProspecto();
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Etapa | "todos">("todos");

  if (q.isLoading) return <ListSkeleton label="Cargando prospectos" />;
  if (q.isError) {
    return (
      <ErrorState mensaje="No se pudieron cargar los prospectos." onRetry={() => q.refetch()} />
    );
  }

  const prospectos = q.data?.data ?? [];

  const conteos: Record<Etapa, number> = {
    contactado: 0,
    interesado: 0,
    calificado: 0,
    convertido: 0,
    otro: 0,
  };
  for (const p of prospectos) {
    conteos[clasificarEtapa(p.estado)] += 1;
  }

  const total = prospectos.length;
  const convertidos = conteos.convertido;
  const tasaConversion = total > 0 ? Math.round((convertidos / total) * 100) : 0;

  const visibles =
    filtro === "todos"
      ? prospectos
      : prospectos.filter((p) => clasificarEtapa(p.estado) === filtro);

  /* Orden de lista: etapas más avanzadas primero (más cerca del cierre). */
  const ordenadas = [...visibles].sort(
    (a, b) => ETAPAS[clasificarEtapa(b.estado)].order - ETAPAS[clasificarEtapa(a.estado)].order,
  );

  const promoverProspecto = async (p: Prospecto) => {
    await promover.mutateAsync(p.id);
    setAviso(`Prospecto ${p.nombre ?? ""} promovido a cliente.`);
  };

  return (
    <div className="space-y-4">
      {/* ── Header con tasa de conversión ──────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: T.text }}>
            Prospectos
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: T.textMuted }}>
            {total === 0 ? (
              "Sin leads en el pipeline."
            ) : (
              <>
                <span style={{ ...MONO, color: T.text }}>{total}</span>
                {" en pipeline · "}
                <span style={{ ...MONO, color: T.posText, fontWeight: 600 }}>
                  {tasaConversion}%
                </span>
                <span style={{ color: T.posText }}> conversión</span>
              </>
            )}
          </p>
        </div>
        {convertidos > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              color: T.posText,
              backgroundColor: T.posBg,
              border: `1px solid ${T.posBorder}`,
            }}
          >
            <span aria-hidden style={{ fontSize: "0.6rem" }}>
              ✓
            </span>
            <span style={MONO}>{convertidos}</span>
            convertidos
          </span>
        )}
      </header>

      {aviso && <AvisoBanner mensaje={aviso} onDismiss={() => setAviso(null)} />}

      {/* ── Embudo (filtro interactivo) ────────────────────────────────── */}
      {total > 0 && <Funnel conteos={conteos} total={total} active={filtro} onSelect={setFiltro} />}

      {/* ── Lista de prospectos ────────────────────────────────────────── */}
      {total === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl px-6 py-10 text-center"
          style={{ border: `1px dashed ${T.border}`, backgroundColor: T.surfaceSunken }}
        >
          <span aria-hidden className="text-xl" style={{ ...MONO, color: T.textSubtle }}>
            +
          </span>
          <p className="text-sm font-medium" style={{ color: T.text }}>
            Sin prospectos
          </p>
          <p className="text-xs" style={{ color: T.textSubtle }}>
            Aún no hay leads en el pipeline.
          </p>
        </div>
      ) : (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-0.5 rounded-full"
              style={{ backgroundColor: T.brand }}
            />
            <h2
              className="text-xs font-semibold uppercase"
              style={{ color: T.textMuted, letterSpacing: "0.08em" }}
            >
              {filtro === "todos" ? "Todos" : ETAPAS[filtro].label}
            </h2>
            <CountChip
              value={ordenadas.length}
              fg={T.brand}
              bg={T.brandSubtle}
              border={T.brandBorder}
            />
          </div>
          {ordenadas.length === 0 ? (
            <div
              className="rounded-xl px-6 py-8 text-center text-sm"
              style={{
                border: `1px dashed ${T.border}`,
                backgroundColor: T.surfaceSunken,
                color: T.textSubtle,
              }}
            >
              Ningún prospecto en esta etapa.
            </div>
          ) : (
            <ul className="space-y-2">
              {ordenadas.map((p) => (
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
        </section>
      )}
    </div>
  );
}
