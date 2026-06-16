import { useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { CatalogoOut } from "./hooks";

const MONO: CSSProperties = { fontFamily: "'Geist Mono', monospace" };

interface CatalogoTabProps<T extends CatalogoOut> {
  titulo: string;
  descripcion: string;
  items: T[];
  isLoading: boolean;
  isError: boolean;
  /** Slot opcional de metadata por fila (ej. "genera cobro" en disposiciones). */
  renderMeta?: (item: T) => ReactNode;
  onCreate: (datos: { codigo: string; nombre: string }) => void;
  onToggle: (item: T) => void;
  isCreating?: boolean;
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="divide-y divide-border" aria-busy="true" role="status">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div
            className="h-6 w-16 shrink-0 animate-pulse rounded-md"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 70}ms` }}
          />
          <div
            className="h-3.5 animate-pulse rounded-md"
            style={{
              width: `${38 + (i % 4) * 12}%`,
              background: "hsl(var(--surface-sunken))",
              animationDelay: `${i * 70 + 30}ms`,
            }}
          />
          <div
            className="ml-auto h-7 w-20 shrink-0 animate-pulse rounded-md"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 70 + 50}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Catalog row ──────────────────────────────────────────────────────────────

function CatalogoRow<T extends CatalogoOut>({
  item,
  renderMeta,
  onToggle,
}: {
  item: T;
  renderMeta?: (item: T) => ReactNode;
  onToggle: (item: T) => void;
}) {
  const activo = item.activo;
  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-sunken"
      style={{ opacity: activo ? 1 : 0.55 }}
    >
      {/* Estado: punto + barra de acento izquierda (verde activo / mute inactivo) */}
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: `hsl(var(${activo ? "--pos" : "--text-subtle"}))` }}
        aria-hidden="true"
      />

      {/* Código — badge Geist Mono */}
      <span
        className="inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-medium tracking-tight"
        style={{
          ...MONO,
          background: "hsl(var(--surface-sunken))",
          color: "hsl(var(--text-muted))",
          border: "1px solid hsl(var(--border))",
        }}
      >
        {item.codigo || "—"}
      </span>

      {/* Nombre — prominente si activo, atenuado si no */}
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium"
        style={{ color: activo ? "hsl(var(--text))" : "hsl(var(--text-muted))" }}
      >
        {item.nombre}
        {!activo && (
          <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-text-subtle">
            inactivo
          </span>
        )}
      </span>

      {/* Metadata opcional */}
      {renderMeta && <span className="hidden shrink-0 sm:block">{renderMeta(item)}</span>}

      {/* Orden — mono, secundario */}
      <span
        className="hidden w-8 shrink-0 text-right text-xs text-text-subtle md:block"
        style={MONO}
      >
        {item.orden}
      </span>

      {/* Toggle activo/inactivo */}
      <Button
        variant={activo ? "ghost" : "outline"}
        size="sm"
        className="shrink-0"
        onClick={() => onToggle(item)}
      >
        {activo ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}

export function CatalogoTab<T extends CatalogoOut>({
  titulo,
  descripcion,
  items,
  isLoading,
  isError,
  renderMeta,
  onCreate,
  onToggle,
  isCreating,
}: CatalogoTabProps<T>) {
  const [showForm, setShowForm] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ codigo: codigo.trim(), nombre: nombre.trim() });
    setCodigo("");
    setNombre("");
    setShowForm(false);
  };

  const activos = items.filter((i) => i.activo).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text">{titulo}</h2>
          <p className="mt-0.5 text-sm text-text-muted">{descripcion}</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="shrink-0 gap-1.5">
          <PlusIcon className="h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {!isLoading && !isError && items.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "hsl(var(--pos))" }}
          />
          <span style={MONO} className="text-text">
            {activos}
          </span>
          activos
          <span className="text-text-subtle">de</span>
          <span style={MONO} className="text-text-muted">
            {items.length}
          </span>
        </div>
      )}

      <section
        className="overflow-hidden rounded-2xl border border-border bg-surface"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        {isLoading ? (
          <SkeletonRows />
        ) : isError ? (
          <div
            role="alert"
            className="px-6 py-12 text-center"
            style={{ background: "hsl(var(--neg-bg))" }}
          >
            <p className="text-sm font-semibold" style={{ color: "hsl(var(--neg))" }}>
              No se pudieron cargar los registros
            </p>
            <p className="mt-1 text-xs" style={{ color: "hsl(var(--neg) / 0.75)" }}>
              Reintentá en unos segundos.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: "hsl(var(--brand-subtle))",
                boxShadow: "0 0 0 6px hsl(var(--brand) / 0.06)",
              }}
            >
              <PlusIcon className="h-6 w-6 text-brand" />
            </div>
            <p className="text-sm font-semibold text-text">Catálogo vacío</p>
            <p className="mt-1 max-w-xs text-sm text-text-muted">
              Todavía no hay registros. Creá el primero para empezar a usarlo.
            </p>
            <Button onClick={() => setShowForm(true)} size="sm" className="mt-4 gap-1.5">
              <PlusIcon className="h-3.5 w-3.5" />
              Nuevo registro
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <CatalogoRow key={item.id} item={item} renderMeta={renderMeta} onToggle={onToggle} />
            ))}
          </div>
        )}
      </section>

      <Dialog open={showForm} onOpenChange={setShowForm} title="Nuevo registro">
        <div className="space-y-4 p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="cat-codigo" className="mb-1 block text-sm font-medium text-text">
                Código
              </label>
              <input
                id="cat-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
                placeholder="ej: call_center"
                style={MONO}
                className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text transition-colors duration-150 focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="cat-nombre" className="mb-1 block text-sm font-medium text-text">
                Nombre
              </label>
              <input
                id="cat-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                placeholder="ej: Call Center"
                className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text transition-colors duration-150 focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isCreating}>
                {isCreating ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
