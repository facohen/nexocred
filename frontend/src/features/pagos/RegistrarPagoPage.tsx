import { PagoForm } from "./PagoForm";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

function ReceiptIcon({ className }: { className?: string }) {
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
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

/**
 * Ruta /pagos: registra un pago. La página da el marco visual (hero con el
 * paso del flujo y el waterfall de imputación) mientras PagoForm conserva toda
 * la lógica de negocio (mismo hook useRegistrarPago, idempotency-key,
 * EntityCombobox y preview de imputaciones). No se tocan props ni hooks.
 */
export function RegistrarPagoPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm">
        {/* Banda de marca a la izquierda: el pago es una acción que mueve plata */}
        <span
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: "hsl(var(--brand))" }}
          aria-hidden="true"
        />
        <div className="flex items-start gap-4 pl-2">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "hsl(var(--brand-subtle))",
              color: "hsl(var(--brand))",
              boxShadow: "0 0 0 5px hsl(var(--brand) / 0.06)",
            }}
          >
            <ReceiptIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1
              className="text-2xl font-bold tracking-tight text-text"
              style={{ letterSpacing: "-0.02em" }}
            >
              Registrar pago
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              Imputá un cobro contra un préstamo. El sistema aplica el{" "}
              <span className="font-medium text-text">waterfall</span> y te muestra dónde cae cada
              peso —punitorio, interés y capital— antes de confirmar.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <FlowStep n="1" label="Préstamo + monto" active />
              <FlowArrow />
              <FlowStep n="2" label="Waterfall" />
              <FlowArrow />
              <FlowStep n="3" label="Confirmado" />
            </div>
          </div>
        </div>
      </header>

      <PagoForm />
    </div>
  );
}

function FlowStep({ n, label, active = false }: { n: string; label: string; active?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors"
      style={{
        borderColor: active ? "hsl(var(--brand-border))" : "hsl(var(--border))",
        background: active ? "hsl(var(--brand-subtle))" : "hsl(var(--surface-sunken))",
        color: active ? "hsl(var(--brand))" : "hsl(var(--text-muted))",
      }}
    >
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-[0.625rem]"
        style={{
          background: active ? "hsl(var(--brand))" : "hsl(var(--border-strong))",
          color: active ? "hsl(var(--brand-foreground))" : "hsl(var(--surface))",
          ...MONO,
        }}
      >
        {n}
      </span>
      {label}
    </span>
  );
}

function FlowArrow() {
  return (
    <span className="text-text-subtle" aria-hidden="true">
      →
    </span>
  );
}
