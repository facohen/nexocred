import { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";

export interface EntityOption {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Selector de entidad con búsqueda — la primitiva que ELIMINA los IDs
 * hardcodeados en operaciones (elegir cliente/préstamo/caja/vendedor). Guarda
 * el id por debajo, muestra `label · hint`. Sobre cmdk (misma base que ⌘K).
 *
 * `options` puede recalcularse desde el query del padre (búsqueda asíncrona):
 * el padre escucha `onQueryChange` y refetchea.
 */
export function EntityCombobox({
  value,
  onChange,
  options,
  onQueryChange,
  placeholder = "Buscar…",
  emptyText = "Sin resultados",
  loading = false,
  className,
}: {
  value: string | null;
  onChange: (id: string, option: EntityOption) => void;
  options: EntityOption[];
  onQueryChange?: (q: string) => void;
  placeholder?: string;
  emptyText?: string;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn(!selected && "text-text-subtle")}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="text-text-subtle">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-pop">
          <Command label="Buscar entidad" shouldFilter={!onQueryChange}>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={(q) => {
                setQuery(q);
                onQueryChange?.(q);
              }}
              placeholder={placeholder}
              className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-text outline-none placeholder:text-text-subtle"
            />
            <Command.List className="max-h-60 overflow-auto p-1">
              {loading ? (
                <div className="px-3 py-2 text-sm text-text-muted">Buscando…</div>
              ) : (
                <Command.Empty className="px-3 py-2 text-sm text-text-muted">
                  {emptyText}
                </Command.Empty>
              )}
              {options.map((opt) => (
                <Command.Item
                  key={opt.id}
                  value={`${opt.label} ${opt.hint ?? ""} ${opt.id}`}
                  onSelect={() => {
                    onChange(opt.id, opt);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-2 text-sm text-text aria-selected:bg-surface-sunken"
                >
                  <span>{opt.label}</span>
                  {opt.hint && <span className="font-num text-xs text-text-subtle">{opt.hint}</span>}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  );
}
