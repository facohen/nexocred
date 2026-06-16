import { useState } from "react";
import {
  usePromesas,
  useCrearPromesa,
  type PromesaOut,
  type PromesaEstado,
} from "@/lib/api/queries";
import { MoneyText } from "@/components/MoneyText";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

type Tone = "brand" | "pos" | "warn" | "neg";

const ESTADO_META: Record<PromesaEstado, { tone: Tone; label: string }> = {
  vigente: { tone: "brand", label: "Vigente" },
  cumplida: { tone: "pos", label: "Cumplida" },
  parcial: { tone: "warn", label: "Parcial" },
  rota: { tone: "neg", label: "Rota" },
};

function EstadoChip({ estado }: { estado: PromesaEstado }) {
  const meta = ESTADO_META[estado] ?? { tone: "brand" as Tone, label: estado };
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: `hsl(var(--${meta.tone}-bg))`,
        color: `hsl(var(--${meta.tone}))`,
        border: `1px solid hsl(var(--${meta.tone}-border))`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: `hsl(var(--${meta.tone}))` }}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}

function PromesaRow({ promesa }: { promesa: PromesaOut }) {
  const meta = ESTADO_META[promesa.estado] ?? { tone: "brand" as Tone, label: promesa.estado };
  return (
    <div
      className="relative flex items-center gap-4 px-4 py-3"
      style={{ borderLeft: `3px solid hsl(var(--${meta.tone}) / 0.6)` }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <MoneyText value={promesa.monto_prometido} className="text-sm font-semibold" />
        <span className="text-xs text-text-muted" style={MONO}>
          {promesa.fecha_prometida}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <EstadoChip estado={promesa.estado} />
        <span className="text-[10px] uppercase tracking-wider text-text-subtle">
          {promesa.canal_origen === "call" ? "Call" : "Campo"}
        </span>
      </div>
    </div>
  );
}

function NuevaPromesaForm({ prestamoId, onClose }: { prestamoId: string; onClose: () => void }) {
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [canal, setCanal] = useState<"call" | "campo">("call");
  const { mutate, isPending, error } = useCrearPromesa();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!monto || !fecha) return;
    mutate(
      {
        prestamo_id: prestamoId,
        monto_prometido: monto,
        fecha_prometida: fecha,
        canal_origen: canal,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border p-4"
      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--surface-sunken))" }}
    >
      <p className="text-sm font-semibold text-text">Nueva promesa</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-muted">Monto</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            required
            className="h-9 w-full rounded-lg border px-3 text-sm text-text focus:outline-none focus:ring-2"
            style={{
              background: "hsl(var(--surface))",
              borderColor: "hsl(var(--border))",
              fontFamily: "'Geist Mono', monospace",
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-muted">Fecha prometida</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="h-9 w-full rounded-lg border px-3 text-sm text-text focus:outline-none focus:ring-2"
            style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--border))" }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-muted">Canal</label>
        <div className="flex gap-2">
          {(["call", "campo"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCanal(c)}
              aria-pressed={canal === c}
              className="rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150"
              style={
                canal === c
                  ? {
                      background: "hsl(var(--brand-bg))",
                      color: "hsl(var(--brand))",
                      borderColor: "hsl(var(--brand-border))",
                    }
                  : {
                      background: "hsl(var(--surface))",
                      color: "hsl(var(--text-muted))",
                      borderColor: "hsl(var(--border))",
                    }
              }
            >
              {c === "call" ? "Llamada" : "Campo"}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "hsl(var(--neg))" }}>
          Error al guardar
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-sunken"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all disabled:opacity-50"
          style={{ background: "hsl(var(--brand))" }}
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

export function PromesasPanel({ prestamoId }: { prestamoId: string }) {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = usePromesas(prestamoId);
  const promesas = data?.data ?? [];

  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--surface))" }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text">Promesas de pago</h3>
          {promesas.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{
                ...MONO,
                background: "hsl(var(--surface-sunken))",
                color: "hsl(var(--text-muted))",
              }}
            >
              {promesas.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border px-2.5 py-1 text-xs font-medium text-text-muted transition-all hover:bg-surface-sunken hover:text-text"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          + Nueva
        </button>
      </div>

      {showForm && (
        <div className="p-3">
          <NuevaPromesaForm prestamoId={prestamoId} onClose={() => setShowForm(false)} />
        </div>
      )}

      {isLoading ? (
        <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <div
                  className="h-3.5 w-24 animate-pulse rounded"
                  style={{
                    background: "hsl(var(--surface-sunken))",
                    animationDelay: `${i * 80}ms`,
                  }}
                />
                <div
                  className="h-2.5 w-16 animate-pulse rounded"
                  style={{
                    background: "hsl(var(--surface-sunken))",
                    animationDelay: `${i * 80 + 40}ms`,
                  }}
                />
              </div>
              <div
                className="h-6 w-16 animate-pulse rounded-full"
                style={{ background: "hsl(var(--surface-sunken))" }}
              />
            </div>
          ))}
        </div>
      ) : promesas.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-text-muted">Sin promesas registradas</p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
          {promesas.map((p) => (
            <PromesaRow key={p.id} promesa={p} />
          ))}
        </div>
      )}
    </section>
  );
}
