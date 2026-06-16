import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import type { Rol } from "@/lib/auth";
import { WorkInboxHero } from "@/components/WorkInbox";

interface AreaTrabajo {
  /** roles que ven esta área */
  roles: Rol[];
  titulo: string;
  descripcion: string;
  to: string;
  /** categoría funcional — determina el accent strip y la sección */
  categoria: "operacion" | "riesgo" | "relacion" | "administracion" | "sistema";
  /** icono SVG inline */
  icono: React.ReactNode;
}

// ─── Icons (área glyphs) ──────────────────────────────────────────────────────

const ICON_PIPELINE = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICON_CLIENTES = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M1 13c0-2.21 2.24-4 5-4s5 1.79 5 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M14.5 13c0-1.66-1.12-3-2.5-3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const ICON_EVALUACION = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M5 8l2 2 4-4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ICON_RIESGO = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M8 6v3M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICON_CARTERA = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="4" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const ICON_RUTA = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 6c0 4 8 2 8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICON_CRM = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v6A1.5 1.5 0 0112.5 11H9l-3 3v-3H3.5A1.5 1.5 0 012 9.5v-6z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const ICON_TESORERIA = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M1.5 7h13" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="5" cy="10" r="1" fill="currentColor" />
    <circle cx="8" cy="10" r="1" fill="currentColor" />
  </svg>
);

const ICON_TORRE = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 12L5 6l3 3 2.5-5L14 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ICON_USUARIOS = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M2 14c0-3.31 2.69-6 6-6s6 2.69 6 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

// Hub de entrada multi-rol: cada área enlaza al home de trabajo correspondiente.
const AREAS: AreaTrabajo[] = [
  {
    roles: ["vendedor"],
    titulo: "Pipeline",
    descripcion: "Tus solicitudes en originación.",
    to: "/originar",
    categoria: "operacion",
    icono: ICON_PIPELINE,
  },
  {
    roles: ["vendedor"],
    titulo: "Mis clientes",
    descripcion: "Tu cartera de clientes.",
    to: "/mis-clientes",
    categoria: "relacion",
    icono: ICON_CLIENTES,
  },
  {
    roles: ["analista_riesgo"],
    titulo: "Evaluación",
    descripcion: "Cola de solicitudes a evaluar y aprobar.",
    to: "/evaluacion",
    categoria: "operacion",
    icono: ICON_EVALUACION,
  },
  {
    roles: ["analista_riesgo", "ceo"],
    titulo: "Riesgo",
    descripcion: "Tablero de cartera y alertas.",
    to: "/riesgo/tablero",
    categoria: "riesgo",
    icono: ICON_RIESGO,
  },
  {
    roles: ["administrativo"],
    titulo: "Cartera",
    descripcion: "Préstamos, pagos, caja y novaciones.",
    to: "/prestamos",
    categoria: "administracion",
    icono: ICON_CARTERA,
  },
  {
    roles: ["administrativo"],
    titulo: "Ruta de Cobranza",
    descripcion: "Paradas y promesas de pago.",
    to: "/ruta",
    categoria: "operacion",
    icono: ICON_RUTA,
  },
  {
    roles: ["vendedor", "administrativo"],
    titulo: "Relación (CRM)",
    descripcion: "Inbox de gestiones e incidentes.",
    to: "/crm/inbox",
    categoria: "relacion",
    icono: ICON_CRM,
  },
  {
    roles: ["administrativo"],
    titulo: "Tesorería",
    descripcion: "Cajas, conciliación y movimientos.",
    to: "/tesoreria",
    categoria: "administracion",
    icono: ICON_TESORERIA,
  },
  {
    roles: ["ceo", "administrativo"],
    titulo: "Tablero Ejecutivo",
    descripcion: "Indicadores y torre de control.",
    to: "/torre",
    categoria: "riesgo",
    icono: ICON_TORRE,
  },
  {
    roles: ["admin_sistema"],
    titulo: "Usuarios",
    descripcion: "Configuración de usuarios y roles.",
    to: "/usuarios",
    categoria: "sistema",
    icono: ICON_USUARIOS,
  },
];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// ─── Sistema de tiers visuales ────────────────────────────────────────────────
//
// La jerarquía es el punto de toda esta pantalla. Tres tiers, cada uno mapea a
// una banda de urgencia del patrón inbox (vencidas / hoy / próximas) y carga un
// peso visual inconfundiblemente distinto:
//
//   TIER 1 · "Vencidas" (Operación)
//     · DOMINA la página: bloque de superficie hundida, rail izquierdo de 4px en
//       neg-border, badge de conteo sobredimensionado en neg-bg/neg-text, y una
//       tarjeta banner adentro.
//   TIER 2 · "Hoy" (Relación + Riesgo)
//     · Elevación estándar, rail izquierdo de 4px en brand, badge normal.
//   TIER 3 · "Próximas" (Administración + Sistema)
//     · Muteado: sin relleno de superficie, rail hairline, opacidad bajada,
//       solo tarjetas compactas.
//
// Los strips de prioridad por tarjeta usan la escala ordinal de riesgo
// (risk-90 → risk-0) para que el color SEÑALE urgencia, no decore.

type CategoriaStyle = {
  /** label del badge de tipo, en la tarjeta */
  badgeLabel: string;
  /** clase de color del icono (token-based) */
  iconText: string;
  /** fondo del contenedor del icono */
  iconBg: string;
  /** badge de tipo: bg + texto */
  badge: string;
  /** strip de prioridad por tarjeta (escala de riesgo ordinal) */
  priorityStrip: string;
};

const CATEGORIA_STYLE: Record<AreaTrabajo["categoria"], CategoriaStyle> = {
  // Operación → máxima urgencia (rojo de riesgo)
  operacion: {
    badgeLabel: "Operación",
    iconText: "text-neg",
    iconBg: "bg-neg-bg",
    badge: "bg-neg-bg text-neg",
    priorityStrip: "bg-risk-90",
  },
  // Relación → vínculo sano (verde)
  relacion: {
    badgeLabel: "Relación",
    iconText: "text-pos",
    iconBg: "bg-pos-bg",
    badge: "bg-pos-bg text-pos",
    priorityStrip: "bg-risk-0",
  },
  // Riesgo → atención (ámbar)
  riesgo: {
    badgeLabel: "Riesgo",
    iconText: "text-warn",
    iconBg: "bg-warn-bg",
    badge: "bg-warn-bg text-warn",
    priorityStrip: "bg-risk-60",
  },
  // Administración → informativo
  administracion: {
    badgeLabel: "Admin",
    iconText: "text-info",
    iconBg: "bg-info-bg",
    badge: "bg-info-bg text-info",
    priorityStrip: "bg-info-border",
  },
  // Sistema → neutro
  sistema: {
    badgeLabel: "Sistema",
    iconText: "text-text-muted",
    iconBg: "bg-surface-sunken",
    badge: "bg-surface-sunken text-text-muted",
    priorityStrip: "bg-border-strong",
  },
};

// ─── Piezas compartidas ────────────────────────────────────────────────────────

function ArrowGo({ className = "" }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-fast group-hover:translate-x-0.5 ${className}`}
    >
      <path
        d="M2.5 6h7M6 2.5L9.5 6 6 9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Tier = "vencidas" | "hoy" | "proximas";

const TIER_META: Record<Tier, { rail: string; dot: string; countBadge: string; label: string }> = {
  // Rail izquierdo de 4px en neg-border, badge de conteo en neg-bg/neg-text:
  // el tratamiento "overdue dominates" del spec.
  vencidas: {
    rail: "before:bg-neg-border",
    dot: "bg-neg",
    countBadge: "bg-neg-bg text-neg ring-1 ring-inset ring-neg-border",
    label: "Prioritario",
  },
  // Rail izquierdo de 4px en brand.
  hoy: {
    rail: "before:bg-brand",
    dot: "bg-brand",
    countBadge: "bg-brand-subtle text-brand ring-1 ring-inset ring-brand/20",
    label: "Hoy",
  },
  // Rail hairline muteado.
  proximas: {
    rail: "before:bg-border-strong",
    dot: "bg-border-strong",
    countBadge: "bg-surface-sunken text-text-subtle ring-1 ring-inset ring-border",
    label: "Después",
  },
};

/**
 * Encabezado de sección. El tier "vencidas" recibe un heading más grande + un
 * badge de conteo relleno y sobredimensionado para que domine de un vistazo;
 * los tiers inferiores se achican.
 */
function SectionHeader({
  id,
  label,
  count,
  tier,
}: {
  id: string;
  label: string;
  count: number;
  tier: Tier;
}) {
  const meta = TIER_META[tier];
  const isDominant = tier === "vencidas";

  return (
    <div className="mb-3 flex items-center gap-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
      <h2
        id={id}
        className={
          isDominant
            ? "text-sm font-bold uppercase tracking-[0.14em] text-text"
            : "text-xs font-semibold uppercase tracking-[0.14em] text-text-muted"
        }
      >
        {label}
      </h2>
      <span
        className={`grid place-items-center rounded-full font-semibold tabular-nums ${meta.countBadge} ${
          isDominant ? "h-6 min-w-6 px-2 text-sm" : "h-5 min-w-5 px-1.5 text-xs"
        }`}
        style={MONO}
        aria-label={`${count} áreas`}
      >
        {count}
      </span>
      <span
        className={`text-[10px] font-medium uppercase tracking-[0.18em] ${
          isDominant ? "text-neg" : "text-text-subtle"
        }`}
      >
        {meta.label}
      </span>
      <span className="ml-auto h-px w-12 bg-border sm:w-24" aria-hidden="true" />
    </div>
  );
}

// ─── Tarjeta de tarea ──────────────────────────────────────────────────────────
//
// Tarjeta reutilizable. La densidad la maneja `prominence`:
//   · "hero"     → banner del tier 1, icono grande, tipografía mayor, CTA "Abrir área"
//   · "standard" → tarjeta de fila normal
//   · "muted"    → tier 3 compacta, opacidad bajada hasta hover
//
// Cada tarjeta: strip de color de 4px a la izquierda (basado en riesgo), nombre
// del área en negrita, badge de tipo, y botón de acción inline a la derecha. El
// hover levanta la sombra y desplaza la superficie.

type Prominence = "hero" | "standard" | "muted";

function TaskCard({
  area,
  onClick,
  prominence,
}: {
  area: AreaTrabajo;
  onClick: () => void;
  prominence: Prominence;
}) {
  const s = CATEGORIA_STYLE[area.categoria];
  const isHero = prominence === "hero";
  const isMuted = prominence === "muted";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir ${area.titulo}: ${area.descripcion}`}
      className={[
        "group relative flex w-full items-center gap-4 overflow-hidden rounded-xl border text-left",
        "transition-all duration-150 ease-out outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        // superficie base + lift en hover (sombra + desplazamiento de superficie)
        isMuted
          ? "border-border/70 bg-transparent hover:border-border-strong hover:bg-surface hover:shadow-sm"
          : "border-border bg-surface shadow-xs hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-sunken hover:shadow-pop",
        isHero ? "p-5 sm:col-span-2" : "p-4",
        isMuted ? "opacity-80 hover:opacity-100" : "",
      ].join(" ")}
    >
      {/* Strip de prioridad de 4px a la izquierda (color ordinal de riesgo) */}
      <span className={`absolute inset-y-0 left-0 w-1 ${s.priorityStrip}`} aria-hidden="true" />

      {/* Tile del icono */}
      <span
        className={[
          "grid shrink-0 place-items-center rounded-xl transition-transform duration-150",
          "group-hover:scale-105",
          s.iconBg,
          s.iconText,
          isHero ? "ml-1 h-14 w-14" : "ml-1 h-10 w-10",
        ].join(" ")}
      >
        {area.icono}
      </span>

      {/* Cuerpo */}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span
            className={`truncate font-bold leading-tight text-text ${isHero ? "text-lg" : "text-sm"}`}
          >
            {area.titulo}
          </span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.badge}`}
          >
            {s.badgeLabel}
          </span>
        </span>
        <span className={`truncate text-text-muted ${isHero ? "text-sm" : "text-xs"}`}>
          {area.descripcion}
        </span>
      </span>

      {/* Botón de acción inline a la derecha */}
      <span
        className={[
          "ml-auto flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold",
          "transition-colors duration-150",
          "bg-surface ring-1 ring-inset ring-border group-hover:bg-brand group-hover:text-brand-foreground group-hover:ring-brand",
          isMuted ? "text-text-muted" : "text-text",
        ].join(" ")}
      >
        <span className={isHero ? "" : "hidden sm:inline"}>{isHero ? "Abrir área" : "Abrir"}</span>
        <ArrowGo />
      </span>
    </button>
  );
}

// ─── Estados ────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-7" aria-busy="true" aria-label="Cargando bandeja de trabajo">
      <div className="relative space-y-3 rounded-2xl bg-surface-sunken p-4 pl-5 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full before:bg-neg-border">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-neg-border" />
          <div className="h-3 w-28 animate-pulse rounded bg-border" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-neg-bg" />
        </div>
        <div className="h-24 animate-pulse rounded-xl bg-surface" />
      </div>
      {[2, 2].map((count, idx) => (
        <div key={idx} className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-border-strong" />
            <div className="h-3 w-24 animate-pulse rounded bg-border" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl bg-surface-sunken" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-surface-sunken py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-pos-bg text-pos shadow-xs">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4 4 10-10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-text">Bandeja despejada</p>
        <p className="mt-1 text-xs leading-relaxed text-text-subtle">
          No tenés áreas de trabajo asignadas a tu perfil. Cuando se te asigne una, va a aparecer
          acá.
        </p>
      </div>
    </div>
  );
}

// ─── Wrapper de sección por tier ─────────────────────────────────────────────────
//
// `tier` maneja el color del rail izquierdo y (para "vencidas") el bloque
// dominante hundido.

function TierSection({
  id,
  label,
  tier,
  children,
  count,
}: {
  id: string;
  label: string;
  tier: Tier;
  count: number;
  children: React.ReactNode;
}) {
  const meta = TIER_META[tier];
  const isDominant = tier === "vencidas";

  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} label={label} count={count} tier={tier} />
      <div
        className={[
          "relative pl-4",
          // rail izquierdo de 4px vía ::before, color por tier
          "before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-full",
          meta.rail,
          // el tier dominante se apoya en una superficie hundida para pesar más
          isDominant
            ? "rounded-2xl bg-surface-sunken py-4 pr-4 shadow-xs ring-1 ring-inset ring-border"
            : "",
          tier === "proximas" ? "opacity-95" : "",
        ].join(" ")}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
      </div>
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────────

/**
 * BandejaHome — hub de trabajo multi-rol con jerarquía de bandeja.
 *
 * Tres tiers de peso visual descendente:
 *   1 · Operación  → "vencidas": bloque hundido dominante, rail neg-border, badge grande
 *   2 · Relación + Riesgo → "hoy": elevación estándar, rail brand
 *   3 · Admin + Sistema → "próximas": muteado, rail hairline, tarjetas compactas
 */
export function BandejaHome() {
  const navigate = useNavigate();
  const { user } = useSession();

  if (!user) {
    return (
      <div className="space-y-7">
        <WorkInboxHero
          title="Mi bandeja"
          subtitle="Todo lo que tenés que hacer hoy, en un solo lugar."
        />
        <LoadingSkeleton />
      </div>
    );
  }

  const roles = user.roles;
  const areas = AREAS.filter((a) => a.roles.some((r) => roles.includes(r)));

  const operacion = areas.filter((a) => a.categoria === "operacion");
  const relacionRiesgo = areas.filter(
    (a) => a.categoria === "relacion" || a.categoria === "riesgo",
  );
  const adminSistema = areas.filter(
    (a) => a.categoria === "administracion" || a.categoria === "sistema",
  );

  // El primer área operativa se eleva a banner dominante.
  const [operacionHero, ...operacionRest] = operacion;

  return (
    <div className="space-y-7">
      <WorkInboxHero
        title="Mi bandeja"
        subtitle="Todo lo que tenés que hacer hoy, en un solo lugar."
      />

      {areas.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-7">
          {/* TIER 1 · Operación — dominante */}
          {operacion.length > 0 && (
            <TierSection
              id="section-operacion"
              label="Operación"
              tier="vencidas"
              count={operacion.length}
            >
              {operacionHero && (
                <TaskCard
                  key={`${operacionHero.to}-${operacionHero.titulo}`}
                  area={operacionHero}
                  prominence="hero"
                  onClick={() => navigate({ to: operacionHero.to })}
                />
              )}
              {operacionRest.map((a) => (
                <TaskCard
                  key={`${a.to}-${a.titulo}`}
                  area={a}
                  prominence="standard"
                  onClick={() => navigate({ to: a.to })}
                />
              ))}
            </TierSection>
          )}

          {/* TIER 2 · Relación + Riesgo — estándar */}
          {relacionRiesgo.length > 0 && (
            <TierSection
              id="section-relacion"
              label="Relación y Riesgo"
              tier="hoy"
              count={relacionRiesgo.length}
            >
              {relacionRiesgo.map((a) => (
                <TaskCard
                  key={`${a.to}-${a.titulo}`}
                  area={a}
                  prominence="standard"
                  onClick={() => navigate({ to: a.to })}
                />
              ))}
            </TierSection>
          )}

          {/* TIER 3 · Administración + Sistema — muteado */}
          {adminSistema.length > 0 && (
            <TierSection
              id="section-admin"
              label="Administración"
              tier="proximas"
              count={adminSistema.length}
            >
              {adminSistema.map((a) => (
                <TaskCard
                  key={`${a.to}-${a.titulo}`}
                  area={a}
                  prominence="muted"
                  onClick={() => navigate({ to: a.to })}
                />
              ))}
            </TierSection>
          )}
        </div>
      )}
    </div>
  );
}
