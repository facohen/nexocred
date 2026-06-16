import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import { destinosNavegables } from "@/lib/nav";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type PersonaListItem = components["schemas"]["PersonaListItem"];

/** Acciones globales rápidas (también accesibles por botones visibles en la UI). */
interface QuickAction {
  label: string;
  to: string;
  roles: string[];
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Registrar pago", to: "/pagos", roles: ["administrativo"] },
  { label: "Nuevo crédito", to: "/originar", roles: ["vendedor"] },
  { label: "Nueva persona", to: "/personas", roles: ["vendedor", "analista_riesgo"] },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useSession();
  const navigate = useNavigate();
  const destinos = destinosNavegables(user?.roles);
  const acciones = QUICK_ACTIONS.filter((a) =>
    a.roles.some((r) => user?.roles?.includes(r as never)),
  );

  const [query, setQuery] = useState("");
  const [personas, setPersonas] = useState<PersonaListItem[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Búsqueda de personas por CUIL/nombre cuando hay query (debounced).
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setPersonas([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch<{ data: PersonaListItem[] }>("/personas/buscar", { query: { q: query } })
        .then((r) => {
          if (!cancelled) setPersonas(r.data ?? []);
        })
        .catch(() => {
          if (!cancelled) setPersonas([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  if (!open) return null;

  const go = (to: string) => {
    onOpenChange(false);
    setQuery("");
    void navigate({ to: to as never });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-32 backdrop-blur-[1px]"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface text-text shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Paleta de comandos" shouldFilter={false}>
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar persona (CUIL/nombre), acción o destino…"
            className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text outline-none placeholder:text-text-subtle"
          />
          <Command.List className="max-h-80 overflow-auto p-2">
            <Command.Empty className="px-3 py-2 text-sm text-text-muted">
              Sin resultados.
            </Command.Empty>

            {personas.length > 0 && (
              <Command.Group heading="Personas">
                {personas.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`persona-${p.id}`}
                    onSelect={() => go(`/personas/${p.id}`)}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-text aria-selected:bg-surface-sunken"
                  >
                    <span>
                      {p.apellido}, {p.nombre}
                    </span>
                    <span className="font-num text-xs text-text-subtle">{p.cuil}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {acciones.length > 0 && (
              <Command.Group heading="Acciones">
                {acciones.map((a) => (
                  <Command.Item
                    key={a.to + a.label}
                    value={`accion-${a.label}`}
                    onSelect={() => go(a.to)}
                    className="cursor-pointer rounded-md px-3 py-2 text-sm text-text aria-selected:bg-surface-sunken"
                  >
                    {a.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Ir a">
              {destinos.map((d) => (
                <Command.Item
                  key={d.to}
                  value={`destino-${d.label}`}
                  onSelect={() => go(d.to)}
                  className="cursor-pointer rounded-md px-3 py-2 text-sm text-text aria-selected:bg-surface-sunken"
                >
                  {d.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
