import { useState } from "react";
import { usePersonas } from "@/lib/api/queries";
import { PersonaForm } from "@/features/personas/PersonaForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ClienteElegido {
  id: string;
  nombre: string;
  dni: string;
}

/**
 * Paso 1 del asistente: elegir un cliente existente (búsqueda) o dar de alta uno
 * nuevo reusando el PersonaForm (misma validación Zod, mismo contrato). No se
 * reescribe la lógica de alta: se embebe.
 */
export function StepCliente({ onElegir }: { onElegir: (cliente: ClienteElegido) => void }) {
  const [modo, setModo] = useState<"buscar" | "crear">("buscar");
  const [q, setQ] = useState("");
  const personasQ = usePersonas({ nombre: q.trim() || undefined });
  const resultados = personasQ.data?.data ?? [];

  if (modo === "crear") {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-text">Nuevo cliente</h2>
            <p className="mt-0.5 text-sm text-text-muted">
              Se da de alta y queda elegido para esta solicitud.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setModo("buscar")}>
            ← Buscar existente
          </Button>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <PersonaForm
            onCreated={(id) =>
              // El nombre/DNI se completan al avanzar; con el id basta para originar.
              onElegir({ id, nombre: "Nuevo cliente", dni: "" })
            }
          />
        </div>
      </div>
    );
  }

  const buscando = personasQ.isLoading;
  const conTermino = q.trim().length > 0;
  const vacio = !buscando && resultados.length === 0;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-text">
            ¿Para quién es el préstamo?
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">Buscá un cliente o cargá uno nuevo.</p>
        </div>
        <Button size="sm" onClick={() => setModo("crear")}>
          + Nuevo
        </Button>
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, apellido o DNI…"
          aria-label="Buscar cliente"
          autoFocus
          className="h-11 pl-9 text-[15px]"
        />
      </div>

      {buscando && <ResultadosSkeleton />}

      {vacio && <EstadoVacio conTermino={conTermino} onCrear={() => setModo("crear")} />}

      {!buscando && resultados.length > 0 && (
        <ul className="space-y-2">
          {resultados.map((p) => {
            const nombreCompleto = `${p.nombre} ${p.apellido}`.trim();
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-label={`Elegir ${nombreCompleto}`}
                  onClick={() => onElegir({ id: p.id, nombre: nombreCompleto, dni: p.dni })}
                  className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 text-left shadow-sm transition-all duration-150 hover:border-brand-subtle hover:bg-surface-sunken hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-xs font-semibold text-text-muted transition-colors group-hover:bg-brand-subtle group-hover:text-brand"
                  >
                    {inicialesDe(nombreCompleto)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">
                      {nombreCompleto || "—"}
                    </span>
                    <span className="block text-xs text-text-muted">
                      DNI <span className="font-num tabular-nums">{p.dni}</span>
                    </span>
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0 text-text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ResultadosSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
        >
          <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-2/5 animate-pulse rounded bg-surface-sunken" />
            <span className="block h-2.5 w-1/4 animate-pulse rounded bg-surface-sunken" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function EstadoVacio({ conTermino, onCrear }: { conTermino: boolean; onCrear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface-sunken px-6 py-10 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface text-text-subtle ring-1 ring-border">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <p className="text-sm font-medium text-text">
        {conTermino ? "Sin resultados" : "Buscá un cliente"}
      </p>
      <p className="mt-1 max-w-xs text-xs text-text-muted">
        {conTermino
          ? "Probá con otro nombre o documento, o cargá un cliente nuevo."
          : "Escribí un nombre, apellido o DNI para empezar."}
      </p>
      {conTermino && (
        <Button size="sm" variant="outline" className="mt-4" onClick={onCrear}>
          + Cargar cliente nuevo
        </Button>
      )}
    </div>
  );
}

function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
