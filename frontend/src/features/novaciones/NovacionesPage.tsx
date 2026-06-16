import { useState } from "react";
import { useNovacion } from "@/lib/api/queries";
import { newIdempotencyKey } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import { TransactionButton } from "@/components/TransactionButton";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api/schema";

type Detalle = components["schemas"]["NovacionDetalleOut"];

type Tipo = "refinanciar" | "consolidar" | "transferir" | "repactar-rapido";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const TIPOS: { value: Tipo; label: string; glyph: string; hint: string }[] = [
  {
    value: "refinanciar",
    label: "Refinanciar",
    glyph: "♻️",
    hint: "Nueva curva sobre el mismo capital",
  },
  { value: "consolidar", label: "Consolidar", glyph: "🔗", hint: "Varios préstamos en uno" },
  { value: "transferir", label: "Transferir", glyph: "↪️", hint: "Cambio de titular o ruta" },
  { value: "repactar-rapido", label: "Repactar", glyph: "⚡", hint: "Repacto exprés de cuotas" },
];

function tipoMeta(value: string) {
  return TIPOS.find((t) => t.value === value) ?? { label: value, glyph: "🔄", hint: "" };
}

// ─── Status mapping → semantic tokens ─────────────────────────────────────────

type EstadoTone = "pos" | "warn" | "neg";

function estadoTone(estado: string): EstadoTone {
  const e = estado.toLowerCase();
  if (e.includes("aprob") || e.includes("activ") || e.includes("ejecut") || e.includes("vigente"))
    return "pos";
  if (e.includes("rechaz") || e.includes("anul") || e.includes("error") || e.includes("fall"))
    return "neg";
  return "warn";
}

function EstadoBadge({ estado }: { estado: string }) {
  const tone = estadoTone(estado);
  const bg = `hsl(var(--${tone}-bg))`;
  const fg = `hsl(var(--${tone}))`;
  const border = `hsl(var(--${tone}-border))`;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: bg, color: fg, border: `1px solid ${border}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: fg }} aria-hidden="true" />
      {estado}
    </span>
  );
}

// ─── Loan chip ────────────────────────────────────────────────────────────────

function LoanChip({
  id,
  label,
  variant,
}: {
  id: string;
  label: string;
  variant: "origen" | "destino";
}) {
  const isDestino = variant === "destino";
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border p-3"
      style={{
        borderColor: isDestino ? "hsl(var(--brand-border))" : "hsl(var(--border))",
        background: isDestino ? "hsl(var(--brand-subtle))" : "hsl(var(--surface-sunken))",
      }}
    >
      <span
        className="text-[0.625rem] font-semibold uppercase tracking-widest"
        style={{ color: isDestino ? "hsl(var(--brand))" : "hsl(var(--text-subtle))" }}
      >
        {label}
      </span>
      <span className="truncate text-sm font-semibold text-text" style={MONO} title={id}>
        {id}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{ background: "hsl(var(--brand))", color: "hsl(var(--brand-foreground))" }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        className="h-4 w-4"
      >
        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ─── Result: origin loans → new loan flow ─────────────────────────────────────

function CadenaNovacion({ resultado }: { resultado: Detalle }) {
  const meta = tipoMeta(resultado.tipo);
  const origenes = resultado.origenes ?? [];
  const destino = resultado.nuevo_prestamo_id;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header
        className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--surface-sunken))" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden="true">
            {meta.glyph}
          </span>
          <h2 className="text-sm font-semibold text-text">Cadena de novación · {meta.label}</h2>
        </div>
        <EstadoBadge estado={resultado.estado} />
      </header>

      <div className="p-5">
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          {/* Origen(es) */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {origenes.length === 0 ? (
              <LoanChip id="—" label="Origen" variant="origen" />
            ) : (
              origenes.map((id, i) => (
                <LoanChip
                  key={id}
                  id={id}
                  label={origenes.length > 1 ? `Origen ${i + 1}` : "Préstamo origen"}
                  variant="origen"
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-center md:px-1">
            <FlowArrow />
          </div>

          {/* Destino */}
          <div className="flex min-w-0 flex-1">
            <LoanChip
              id={destino ?? "Pendiente de emisión"}
              label="Nuevo préstamo"
              variant="destino"
            />
          </div>
        </div>

        <dl
          className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-4 text-xs"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <div className="flex flex-col gap-0.5">
            <dt className="text-text-subtle">Préstamos consolidados</dt>
            <dd className="text-sm font-semibold text-text" style={MONO}>
              {origenes.length || (destino ? 1 : 0)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-text-subtle">Emitida</dt>
            <dd className="text-sm font-semibold text-text" style={MONO}>
              {resultado.created_at
                ? new Date(resultado.created_at).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function NovacionesPage() {
  const [tipo, setTipo] = useState<Tipo>("refinanciar");
  const [prestamoId, setPrestamoId] = useState("");
  // Key estable por intento: los retries del MISMO botón reusan la key (idempotencia);
  // se rota sólo tras un éxito para que la siguiente novación tenga una key fresca.
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());
  const novacion = useNovacion();
  const resultado = novacion.data;
  const errorMsg =
    novacion.error instanceof ApiError
      ? novacion.error.message
      : novacion.error
        ? "No se pudo ejecutar la novación"
        : null;

  const meta = tipoMeta(tipo);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-text"
          style={{ letterSpacing: "-0.02em" }}
        >
          Novaciones
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Cancelá uno o varios préstamos y emití uno nuevo en su lugar. La operación es idempotente.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-text">Tipo de novación</h2>

        {/* Pill-toggles con glifo + hint del tipo activo */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIPOS.map((t) => {
            const active = tipo === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTipo(t.value)}
                aria-pressed={active}
                className="flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-0.5"
                style={{
                  borderColor: active ? "hsl(var(--brand-border))" : "hsl(var(--border))",
                  background: active ? "hsl(var(--brand-subtle))" : "hsl(var(--surface))",
                  boxShadow: active ? "var(--shadow-xs)" : "none",
                }}
              >
                <span className="text-base" aria-hidden="true">
                  {t.glyph}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: active ? "hsl(var(--brand))" : "hsl(var(--text))" }}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-xs text-text-muted">{meta.hint}</p>

        <div
          className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="prestamo-origen" className="text-sm font-medium text-text">
              Préstamo origen
            </label>
            <Input
              id="prestamo-origen"
              value={prestamoId}
              onChange={(e) => setPrestamoId(e.target.value)}
              placeholder="ID del préstamo a novar"
              style={MONO}
            />
          </div>
          <TransactionButton
            onClick={() =>
              novacion.mutate(
                { tipo, body: { prestamo_id: prestamoId }, idempotencyKey: idemKey },
                { onSuccess: () => setIdemKey(newIdempotencyKey()) },
              )
            }
            pending={novacion.isPending}
          >
            {novacion.isPending ? "Ejecutando…" : "Ejecutar novación"}
          </TransactionButton>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border p-3 text-sm"
          style={{
            borderColor: "hsl(var(--neg-border))",
            background: "hsl(var(--neg-bg))",
            color: "hsl(var(--neg))",
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span className="min-w-0">{errorMsg}</span>
        </div>
      )}

      {resultado && <CadenaNovacion resultado={resultado} />}
    </div>
  );
}
