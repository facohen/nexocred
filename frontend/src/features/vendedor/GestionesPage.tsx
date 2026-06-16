import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useTareas,
  useCrearTarea,
  useCompletarTarea,
  usePersonas,
} from "@/lib/api/queries";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkInbox, WorkInboxHero, InboxRow, type InboxSection } from "@/components/WorkInbox";
import type { components } from "@/lib/api/schema";

type Tarea = components["schemas"]["TareaOut"];

const PRIORIDAD_TONO: Record<string, BadgeTone> = {
  alta: "danger",
  media: "warning",
  baja: "default",
};

const TIPO_INTERACCION = ["llamada", "visita", "mensaje", "nota"] as const;
type TipoInteraccion = (typeof TIPO_INTERACCION)[number];

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Gestiones" del vendedor: sus tickets (tareas CRM) como bandeja. El backend
 * (m08) auto-scopea las tareas al operador para vendedores, así que esta vista
 * muestra solo lo suyo. Permite crear un ticket y completarlo (lo que registra
 * una interacción en el timeline del cliente). Los vencidos y de hoy van arriba.
 */
export function GestionesPage() {
  const tareasQ = useTareas();
  const personasQ = usePersonas();
  const [creando, setCreando] = useState(false);

  const nombrePorPersona = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of personasQ.data?.data ?? []) {
      map.set(p.id, `${p.apellido}, ${p.nombre}`.trim());
    }
    return map;
  }, [personasQ.data]);

  const pendientes = useMemo(
    () => (tareasQ.data?.data ?? []).filter((t) => t.estado !== "completada"),
    [tareasQ.data],
  );

  // Particionado por urgencia: vencidas (vencimiento < hoy) arriba, luego el
  // resto. El orden dentro de cada grupo es por vencimiento ascendente.
  const sections = useMemo<InboxSection<Tarea>[]>(() => {
    const hoy = hoyISO();
    const vencidas: Tarea[] = [];
    const proximas: Tarea[] = [];
    for (const t of pendientes) {
      if (t.vencimiento && t.vencimiento < hoy) vencidas.push(t);
      else proximas.push(t);
    }
    const porVencimiento = (a: Tarea, b: Tarea) =>
      (a.vencimiento ?? "9999").localeCompare(b.vencimiento ?? "9999");
    vencidas.sort(porVencimiento);
    proximas.sort(porVencimiento);
    return [
      {
        id: "vencidas",
        title: "Vencidas",
        items: vencidas,
        accent: "danger",
        emptyText: "Sin tickets vencidos. 👌",
      },
      {
        id: "proximas",
        title: "Próximas y sin fecha",
        items: proximas,
        emptyText: "No tenés tickets pendientes.",
      },
    ];
  }, [pendientes]);

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Gestiones"
        subtitle={`${pendientes.length} ${pendientes.length === 1 ? "ticket pendiente" : "tickets pendientes"}`}
        action={
          <Button size="lg" onClick={() => setCreando((v) => !v)}>
            {creando ? "Cerrar" : "+ Nuevo ticket"}
          </Button>
        }
      />

      {creando && (
        <NuevoTicketForm
          personas={personasQ.data?.data ?? []}
          onCreado={() => setCreando(false)}
        />
      )}

      {tareasQ.isError ? (
        <p role="alert" className="text-sm text-neg">
          No se pudieron cargar tus gestiones.
        </p>
      ) : tareasQ.isLoading ? (
        <p className="animate-pulse text-sm text-text-subtle">Cargando gestiones…</p>
      ) : (
        <WorkInbox
          sections={sections}
          keyFor={(t) => t.id}
          renderItem={(t) => (
            <TicketRow tarea={t} nombre={t.persona_id ? nombrePorPersona.get(t.persona_id) : undefined} />
          )}
        />
      )}
    </div>
  );
}

function TicketRow({ tarea, nombre }: { tarea: Tarea; nombre?: string }) {
  const navigate = useNavigate();
  const completar = useCompletarTarea();
  const [resolviendo, setResolviendo] = useState(false);

  return (
    <div className="space-y-2">
      <InboxRow
        title={tarea.titulo ?? "Ticket sin título"}
        context={
          <span>
            {nombre ? (
              <button
                type="button"
                onClick={() => tarea.persona_id && navigate({ to: `/personas/${tarea.persona_id}` as string })}
                className="text-brand hover:underline"
              >
                {nombre}
              </button>
            ) : (
              "Sin cliente asociado"
            )}
            {tarea.descripcion ? ` · ${tarea.descripcion}` : ""}
          </span>
        }
        signals={
          <span className="flex items-center gap-2">
            {tarea.prioridad && (
              <Badge tone={PRIORIDAD_TONO[tarea.prioridad] ?? "default"}>{tarea.prioridad}</Badge>
            )}
            {tarea.vencimiento && (
              <span className="text-xs text-text-subtle">vence {tarea.vencimiento}</span>
            )}
          </span>
        }
        action={
          <Button variant="outline" size="sm" onClick={() => setResolviendo((v) => !v)}>
            {resolviendo ? "Cancelar" : "Completar"}
          </Button>
        }
      />
      {resolviendo && (
        <CompletarTicketForm
          pending={completar.isPending}
          onCompletar={(body) =>
            completar.mutate(
              { tareaId: tarea.id, body },
              { onSuccess: () => setResolviendo(false) },
            )
          }
        />
      )}
    </div>
  );
}

function CompletarTicketForm({
  pending,
  onCompletar,
}: {
  pending: boolean;
  onCompletar: (body: components["schemas"]["CompletarTareaIn"]) => void;
}) {
  const [tipo, setTipo] = useState<TipoInteraccion>("llamada");
  const [detalle, setDetalle] = useState("");

  return (
    <div className="ml-1 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-sunken p-3">
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Tipo de gestión
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoInteraccion)}
          className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-text"
        >
          {TIPO_INTERACCION.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1 text-xs text-text-muted">
        Detalle (opcional)
        <Input
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Resultado del contacto…"
        />
      </label>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => onCompletar({ tipo, detalle: detalle.trim() || null })}
      >
        {pending ? "Guardando…" : "Registrar y cerrar"}
      </Button>
    </div>
  );
}

function NuevoTicketForm({
  personas,
  onCreado,
}: {
  personas: components["schemas"]["PersonaListItem"][];
  onCreado: () => void;
}) {
  const crear = useCrearTarea();
  const [titulo, setTitulo] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [vencimiento, setVencimiento] = useState("");

  const puedeGuardar = titulo.trim().length > 0;

  const guardar = () => {
    if (!puedeGuardar) return;
    crear.mutate(
      {
        titulo: titulo.trim(),
        persona_id: personaId || null,
        prioridad,
        vencimiento: vencimiento || null,
      },
      {
        onSuccess: () => {
          setTitulo("");
          setPersonaId("");
          setVencimiento("");
          onCreado();
        },
      },
    );
  };

  return (
    <Card>
      <CardTitle>Nuevo ticket</CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted sm:col-span-2">
          Título
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Llamar para reprogramar cuota…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Cliente (opcional)
          <select
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-text"
          >
            <option value="">— Sin cliente —</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.apellido}, {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Prioridad
          <select
            value={prioridad}
            onChange={(e) => setPrioridad(e.target.value)}
            className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-text"
          >
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Vencimiento (opcional)
          <Input
            type="date"
            value={vencimiento}
            onChange={(e) => setVencimiento(e.target.value)}
          />
        </label>
      </div>
      {crear.isError && (
        <p role="alert" className="mt-2 text-sm text-neg">
          No se pudo crear el ticket. Reintentá.
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button disabled={!puedeGuardar || crear.isPending} onClick={guardar}>
          {crear.isPending ? "Creando…" : "Crear ticket"}
        </Button>
      </div>
    </Card>
  );
}
