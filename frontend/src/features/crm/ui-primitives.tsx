import { T, MONO } from "./ui-tokens";

/* ── Pill semántica — eco de InboxPage ────────────────────────────────── */
export function Pill({
  text,
  bg,
  fg,
  border,
}: {
  text: string;
  bg: string;
  fg: string;
  border?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-px text-[10px] font-medium leading-none uppercase"
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

/* ── Contador en cápsula mono ─────────────────────────────────────────── */
export function CountChip({
  value,
  fg,
  bg,
  border,
}: {
  value: number | string;
  fg?: string;
  bg?: string;
  border?: string;
}) {
  return (
    <span
      className="inline-flex min-w-[1.375rem] items-center justify-center rounded-full px-1.5 py-px text-[10px] font-semibold leading-none"
      style={{
        ...MONO,
        color: fg ?? T.textMuted,
        backgroundColor: bg ?? T.surfaceSunken,
        border: `1px solid ${border ?? T.border}`,
      }}
    >
      {value}
    </span>
  );
}

/* ── Encabezado de sección con acento lateral — eco de InboxPage ──────── */
export function SectionHeader({
  label,
  count,
  accentColor,
  countFg,
  countBg,
  countBorder,
  dimmed = false,
}: {
  label: string;
  count: number;
  accentColor: string;
  countFg?: string;
  countBg?: string;
  countBorder?: string;
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
        className="text-xs font-semibold uppercase"
        style={{
          color: dimmed ? T.textSubtle : T.textMuted,
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </h2>
      <CountChip
        value={count}
        fg={countFg ?? (dimmed ? T.textSubtle : T.textMuted)}
        bg={countBg}
        border={countBorder}
      />
    </div>
  );
}

/* ── Estado vacío con carácter — eco de InboxPage ─────────────────────── */
export function EmptyState({ glyph, title, hint }: { glyph: string; title: string; hint: string }) {
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

/* ── Aviso de éxito ───────────────────────────────────────────────────── */
export function AvisoBanner({ mensaje, onDismiss }: { mensaje: string; onDismiss: () => void }) {
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
        className="ml-3 text-xs opacity-60 transition-opacity duration-150 hover:opacity-100"
        aria-label="Cerrar aviso"
        style={{ color: T.posText }}
      >
        ✕
      </button>
    </div>
  );
}

/* ── Estado de error con reintento ────────────────────────────────────── */
export function ErrorState({ mensaje, onRetry }: { mensaje: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg p-4"
      style={{ backgroundColor: T.negBg, border: `1px solid ${T.negBorder}` }}
    >
      <p className="text-sm font-medium" style={{ color: T.negText }}>
        {mensaje}
      </p>
      <button
        type="button"
        onClick={onRetry}
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

/* ── Avatar tipográfico con relleno geométrico ────────────────────────── */
export function Avatar({
  initials,
  bg,
  fg,
  border,
  size = 36,
}: {
  initials: string;
  bg?: string;
  fg?: string;
  border?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        ...MONO,
        width: size,
        height: size,
        fontSize: size <= 32 ? "0.7rem" : "0.8rem",
        backgroundColor: bg ?? T.brandSubtle,
        color: fg ?? T.brand,
        border: `1.5px solid ${border ?? T.brandBorder}`,
      }}
    >
      {initials}
    </span>
  );
}

/* ── Skeleton genérico de filas ───────────────────────────────────────── */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4 p-1" aria-busy="true" aria-label={label}>
      <div className="space-y-1.5">
        <div
          className="h-6 w-40 animate-pulse rounded-md"
          style={{ backgroundColor: T.surfaceSunken }}
        />
        <div
          className="h-4 w-56 animate-pulse rounded-md"
          style={{ backgroundColor: T.surfaceSunken, opacity: 0.7 }}
        />
      </div>
      <div className="space-y-2.5">
        {[1, 0.78, 0.58, 0.42].map((op, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl"
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
