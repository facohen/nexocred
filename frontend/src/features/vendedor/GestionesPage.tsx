import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useTareas,
  useCrearTarea,
  useCompletarTarea,
  usePersonas,
  usePrestamos,
} from "@/lib/api/queries";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api/schema";

type Tarea = components["schemas"]["TareaOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const PRIORIDAD_TONO: Record<string, BadgeTone> = {
  alta: "danger",
  media: "warning",
  baja: "default",
};

// Color del strip de prioridad lateral. La urgencia (vencido) gana sobre la
// prioridad declarada: un ticket vencido siempre se pinta neg.
const STRIP_BG: Record<"neg" | "warn" | "brand" | "muted", string> = {
  neg: "bg-neg",
  warn: "bg-warn",
  brand: "bg-brand",
  muted: "bg-border-strong",
};

const TIPO_INTERACCION = ["llamada", "visita", "mensaje", "nota"] as const;
type TipoInteraccion = (typeof TIPO_INTERACCION)[number];

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type Grupo = "vencidas" | "hoy" | "proximas";

function clasificar(t: Tarea, hoy: string): Grupo {
  if (t.vencimiento && t.vencimiento < hoy) return "vencidas";
  if (t.vencimiento === hoy) return "hoy";
  return "proximas";
}

function stripFor(grupo: Grupo, prioridad: string | null): keyof typeof STRIP_BG {
  if (grupo === "vencidas") return "neg";
  if (grupo === "hoy") return "warn";
  if (prioridad === "alta") return "neg";
  if (prioridad === "media") return "warn";
  return "brand";
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

  const todas = useMemo(() => tareasQ.data?.data ?? [], [tareasQ.data]);

  const pendientes = useMemo(() => todas.filter((t) => t.estado !== "completada"), [todas]);

  const completadasHoy = useMemo(() => {
    return todas.filter((t) => t.estado === "completada").length;
  }, [todas]);

  // Particionado por urgencia: vencidas, hoy, próximas/sin fecha.
  const grupos = useMemo(() => {
    const hoy = hoyISO();
    const buckets: Record<Grupo, Tarea[]> = { vencidas: [], hoy: [], proximas: [] };
    for (const t of pendientes) buckets[clasificar(t, hoy)].push(t);
    const porVencimiento = (a: Tarea, b: Tarea) =>
      (a.vencimiento ?? "9999").localeCompare(b.vencimiento ?? "9999");
    buckets.vencidas.sort(porVencimiento);
    buckets.hoy.sort(porVencimiento);
    buckets.proximas.sort(porVencimiento);
    return buckets;
  }, [pendientes]);

  const secciones: { id: Grupo; titulo: string; items: Tarea[]; vacio: string }[] = [
    {
      id: "vencidas",
      titulo: "Vencidas",
      items: grupos.vencidas,
      vacio: "Sin tickets vencidos. Vas al día.",
    },
    { id: "hoy", titulo: "Para hoy", items: grupos.hoy, vacio: "Nada vence hoy." },
    {
      id: "proximas",
      titulo: "Próximas y sin fecha",
      items: grupos.proximas,
      vacio: "No tenés tickets pendientes.",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero con contadores en mono y CTA. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text">Gestiones</h1>
          <div className="mt-1.5 flex items-center gap-4 text-sm">
            <Contador valor={pendientes.length} label="pendientes" intent="text" />
            <span className="h-3 w-px bg-border" aria-hidden />
            <Contador valor={grupos.vencidas.length} label="vencidas" intent="neg" />
            <span className="h-3 w-px bg-border" aria-hidden />
            <Contador valor={completadasHoy} label="completadas" intent="pos" />
          </div>
        </div>
        <Button size="lg" onClick={() => setCreando((v) => !v)}>
          {creando ? "Cerrar" : "+ Nuevo ticket"}
        </Button>
      </div>

      {creando && (
        <NuevoTicketForm personas={personasQ.data?.data ?? []} onCreado={() => setCreando(false)} />
      )}

      {tareasQ.isError ? (
        <p role="alert" className="text-sm text-neg">
          No se pudieron cargar tus gestiones.
        </p>
      ) : tareasQ.isLoading ? (
        <GestionesSkeleton />
      ) : (
        <div className="space-y-6">
          {secciones.map((sec) => (
            <section key={sec.id}>
              <div className="mb-2.5 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-text">{sec.titulo}</h2>
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-xs font-medium",
                    sec.id === "vencidas" && sec.items.length > 0
                      ? "bg-neg-bg text-neg"
                      : sec.id === "hoy" && sec.items.length > 0
                        ? "bg-warn-bg text-warn"
                        : "bg-surface-sunken text-text-muted",
                  ].join(" ")}
                  style={MONO}
                >
                  {sec.items.length}
                </span>
              </div>
              {sec.items.length === 0 ? (
                <p className="text-sm text-text-subtle">{sec.vacio}</p>
              ) : (
                <ul className="space-y-2.5">
                  {sec.items.map((t) => (
                    <li key={t.id}>
                      <TicketCard
                        tarea={t}
                        grupo={sec.id}
                        nombre={t.persona_id ? nombrePorPersona.get(t.persona_id) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Contador({
  valor,
  label,
  intent,
}: {
  valor: number;
  label: string;
  intent: "text" | "neg" | "pos";
}) {
  const color = intent === "neg" ? "text-neg" : intent === "pos" ? "text-pos" : "text-text";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-base font-bold ${color}`} style={MONO}>
        {valor}
      </span>
      <span className="text-xs text-text-muted">{label}</span>
    </span>
  );
}

function TicketCard({ tarea, grupo, nombre }: { tarea: Tarea; grupo: Grupo; nombre?: string }) {
  const navigate = useNavigate();
  const completar = useCompletarTarea();
  const [resolviendo, setResolviendo] = useState(false);
  const strip = stripFor(grupo, tarea.prioridad);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div aria-hidden className={`absolute inset-y-0 left-0 w-1 ${STRIP_BG[strip]}`} />
      <div className="flex flex-wrap items-center gap-3 p-4 pl-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {tarea.titulo ?? "Ticket sin título"}
          </p>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {nombre ? (
              <button
                type="button"
                onClick={() =>
                  tarea.persona_id && navigate({ to: `/personas/${tarea.persona_id}` as string })
                }
                className="text-brand transition-colors hover:underline"
              >
                {nombre}
              </button>
            ) : (
              "Sin cliente asociado"
            )}
            {tarea.descripcion ? (
              <span className="text-text-subtle"> · {tarea.descripcion}</span>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {tarea.prioridad && (
            <Badge tone={PRIORIDAD_TONO[tarea.prioridad] ?? "default"}>{tarea.prioridad}</Badge>
          )}
          {tarea.vencimiento && (
            <span
              className={`text-xs ${grupo === "vencidas" ? "text-neg" : "text-text-subtle"}`}
              style={MONO}
            >
              {grupo === "vencidas" ? "venció " : "vence "}
              {tarea.vencimiento}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setResolviendo((v) => !v)}>
            {resolviendo ? "Cancelar" : "Completar"}
          </Button>
        </div>
      </div>

      {resolviendo && (
        <div className="border-t border-border bg-surface-sunken p-4 pl-5">
          <CompletarTicketForm
            pending={completar.isPending}
            onCompletar={(body) =>
              completar.mutate(
                { tareaId: tarea.id, body },
                { onSuccess: () => setResolviendo(false) },
              )
            }
          />
        </div>
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
    <div className="flex flex-wrap items-end gap-2">
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
  const [prestamoId, setPrestamoId] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [vencimiento, setVencimiento] = useState("");

  const prestamosQ = usePrestamos(personaId ? { personaId, estado: "vigente" } : undefined);
  const prestamos = personaId ? (prestamosQ.data?.data ?? []) : [];

  const puedeGuardar = titulo.trim().length > 0;

  const guardar = () => {
    if (!puedeGuardar) return;
    crear.mutate(
      {
        titulo: titulo.trim(),
        persona_id: personaId || null,
        prestamo_id: prestamoId || null,
        prioridad,
        vencimiento: vencimiento || null,
      },
      {
        onSuccess: () => {
          setTitulo("");
          setPersonaId("");
          setPrestamoId("");
          setVencimiento("");
          onCreado();
        },
      },
    );
  };

  const handlePersonaChange = (id: string) => {
    setPersonaId(id);
    setPrestamoId("");
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
            onChange={(e) => handlePersonaChange(e.target.value)}
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
        {personaId && prestamos.length > 0 && (
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Préstamo (opcional)
            <select
              value={prestamoId}
              onChange={(e) => setPrestamoId(e.target.value)}
              className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-text"
            >
              <option value="">— Sin préstamo —</option>
              {prestamos.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.capital ? `$${Number(pr.capital).toLocaleString("es-AR")}` : "Préstamo"} ·{" "}
                  {pr.fecha_desembolso ?? "s/f"}
                </option>
              ))}
            </select>
          </label>
        )}
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
          <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
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

function GestionesSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-border bg-surface-sunken" />
      <div className="h-16 animate-pulse rounded-xl border border-border bg-surface-sunken" />
      <div className="h-16 animate-pulse rounded-xl border border-border bg-surface-sunken" />
    </div>
  );
}
