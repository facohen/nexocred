import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { useAsignar, useAsignarMasivo } from "./hooks";
import { T, MONO, iniciales } from "./ui-tokens";
import { Avatar, AvisoBanner, CountChip } from "./ui-primitives";

/* ── Distribución local: lo que este operador acaba de mover ───────────
 * Las mutaciones no devuelven una lista de carga global, así que la vista
 * de distribución refleja la sesión: a quién se le asignó y cuánto. */
interface DistEntry {
  operadorId: string;
  count: number;
  priorizadas: number;
}

function ordenarDistribucion(map: Map<string, DistEntry>): DistEntry[] {
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ── Mini-barra de carga (transform-only, compositor-friendly) ────────── */
function WorkloadBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0.06, value / max) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: T.surfaceSunken }}
    >
      <div
        className="h-full origin-left rounded-full"
        style={{
          backgroundColor: T.brand,
          transform: `scaleX(${pct})`,
          transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}

/* ── Fila de distribución: avatar + carga + barra ─────────────────────── */
function DistRow({ entry, max }: { entry: DistEntry; max: number }) {
  const [hover, setHover] = useState(false);
  const lider = entry.count === max && max > 0;
  return (
    <li
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center gap-3 overflow-hidden rounded-xl pl-5 pr-4 py-3"
      style={{
        backgroundColor: hover ? T.surfaceSunken : T.surface,
        border: `1px solid ${hover ? T.brandBorder : T.border}`,
        boxShadow: hover ? T.shadowSm : T.shadowXs,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "all 150ms ease",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
        style={{ backgroundColor: lider ? T.brand : T.border }}
      />
      <Avatar initials={iniciales(entry.operadorId)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" style={{ color: T.text }}>
            <span style={{ ...MONO, color: T.textMuted }}>#{entry.operadorId.slice(0, 8)}</span>
          </span>
          {entry.priorizadas > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold leading-none"
              style={{
                ...MONO,
                color: T.warnText,
                backgroundColor: T.warnBg,
                border: `1px solid ${T.warnBorder}`,
              }}
            >
              <span aria-hidden style={{ fontSize: "0.55rem" }}>
                ★
              </span>
              {entry.priorizadas}
            </span>
          )}
        </div>
        <div className="mt-1.5">
          <WorkloadBar value={entry.count} max={max} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end leading-none">
        <span
          className="text-lg font-bold tabular-nums"
          style={{ ...MONO, color: lider ? T.brand : T.text }}
        >
          {entry.count}
        </span>
        <span
          className="mt-0.5 text-[10px] uppercase"
          style={{ color: T.textSubtle, letterSpacing: "0.06em" }}
        >
          personas
        </span>
      </div>
    </li>
  );
}

/** Asignación de personas a operadores: individual y masiva (admin). */
export function AsignacionesPage() {
  const asignar = useAsignar();
  const masivo = useAsignarMasivo();
  const [operadorId, setOperadorId] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [personas, setPersonas] = useState("");
  const [prioritario, setPrioritario] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dist, setDist] = useState<Map<string, DistEntry>>(new Map());

  const registrarDistribucion = (op: string, n: number, prioridad: boolean) => {
    setDist((prev) => {
      const next = new Map(prev);
      const actual = next.get(op) ?? { operadorId: op, count: 0, priorizadas: 0 };
      next.set(op, {
        operadorId: op,
        count: actual.count + n,
        priorizadas: actual.priorizadas + (prioridad ? n : 0),
      });
      return next;
    });
  };

  const filas = useMemo(() => ordenarDistribucion(dist), [dist]);
  const maxCarga = filas.length > 0 ? filas[0].count : 0;
  const totalAsignadas = filas.reduce((s, f) => s + f.count, 0);

  const handleIndividual = async () => {
    await asignar.mutateAsync({ persona_id: personaId, operador_id: operadorId });
    registrarDistribucion(operadorId, 1, prioritario);
    setAviso("Persona asignada.");
    setPersonaId("");
  };

  const handleMasivo = async () => {
    const ids = personas
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await masivo.mutateAsync({ operador_id: operadorId, persona_ids: ids });
    registrarDistribucion(operadorId, ids.length, prioritario);
    setAviso(`${res.asignadas} asignadas.`);
    setPersonas("");
  };

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: T.text }}>
            Asignaciones CRM
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: T.textMuted }}>
            {totalAsignadas === 0 ? (
              "Reparte la cartera entre operadores."
            ) : (
              <>
                <span style={{ ...MONO, color: T.text }}>{totalAsignadas}</span>
                {" asignadas en esta sesión a "}
                <span style={{ ...MONO, color: T.text }}>{filas.length}</span>
                {filas.length === 1 ? " operador" : " operadores"}
              </>
            )}
          </p>
        </div>
        {prioritario && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              color: T.warnText,
              backgroundColor: T.warnBg,
              border: `1px solid ${T.warnBorder}`,
            }}
          >
            <span aria-hidden style={{ fontSize: "0.6rem" }}>
              ★
            </span>
            modo prioritario
          </span>
        )}
      </header>

      {/* ── Composición principal: formularios (izq) + distribución (der) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        {/* Columna de formularios ─────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Asignación individual */}
          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: T.surface,
              border: `1px solid ${T.border}`,
              boxShadow: T.shadowXs,
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-0.5 rounded-full"
                style={{ backgroundColor: T.brand }}
              />
              <h2
                className="text-xs font-semibold uppercase"
                style={{ color: T.textMuted, letterSpacing: "0.08em" }}
              >
                Asignación individual
              </h2>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <FormField
                label="Persona"
                name="persona"
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value)}
                className="min-w-[8rem] flex-1"
              />
              <FormField
                label="Asignar a operador"
                name="operador1"
                value={operadorId}
                onChange={(e) => setOperadorId(e.target.value)}
                className="min-w-[8rem] flex-1"
              />
              <Button
                onClick={handleIndividual}
                disabled={!personaId || !operadorId || asignar.isPending}
              >
                Asignar
              </Button>
            </div>
          </div>

          {/* Asignación masiva */}
          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: T.surfaceSunken,
              border: `1px solid ${T.border}`,
              boxShadow: T.shadowXs,
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-0.5 rounded-full"
                style={{ backgroundColor: T.brand }}
              />
              <h2
                className="text-xs font-semibold uppercase"
                style={{ color: T.textMuted, letterSpacing: "0.08em" }}
              >
                Asignación masiva
              </h2>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <FormField
                label="Personas"
                name="personas"
                placeholder="ids separados por coma"
                value={personas}
                onChange={(e) => setPersonas(e.target.value)}
                className="min-w-[10rem] flex-1"
              />
              <FormField
                label="Operador"
                name="operador"
                placeholder="operador destino"
                value={operadorId}
                onChange={(e) => setOperadorId(e.target.value)}
                className="min-w-[8rem] flex-1"
              />
              <Button
                onClick={handleMasivo}
                disabled={!personas || !operadorId || masivo.isPending}
              >
                Asignar masivo
              </Button>
            </div>
          </div>

          {/* Toggle prioritario */}
          <label
            className="flex cursor-pointer items-center gap-2.5 rounded-xl px-4 py-3 transition-colors duration-150"
            style={{
              backgroundColor: prioritario ? T.warnBg : T.surface,
              border: `1px solid ${prioritario ? T.warnBorder : T.border}`,
            }}
          >
            <input
              type="checkbox"
              checked={prioritario}
              onChange={(e) => setPrioritario(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--warn))]"
            />
            <span
              className="text-sm font-medium"
              style={{ color: prioritario ? T.warnText : T.text }}
            >
              Marcar como tarea prioritaria
            </span>
            <span className="text-xs" style={{ color: T.textSubtle }}>
              resalta la carga urgente del operador
            </span>
          </label>

          {aviso && <AvisoBanner mensaje={aviso} onDismiss={() => setAviso(null)} />}
        </div>

        {/* Columna de distribución ────────────────────────────────────── */}
        <aside>
          <div className="mb-2 flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-0.5 rounded-full"
              style={{ backgroundColor: T.brand }}
            />
            <h2
              className="text-xs font-semibold uppercase"
              style={{ color: T.textMuted, letterSpacing: "0.08em" }}
            >
              Distribución
            </h2>
            <CountChip
              value={filas.length}
              fg={T.brand}
              bg={T.brandSubtle}
              border={T.brandBorder}
            />
          </div>

          {filas.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 rounded-xl px-6 py-10 text-center"
              style={{ border: `1px dashed ${T.border}`, backgroundColor: T.surfaceSunken }}
            >
              <span aria-hidden className="text-xl" style={{ ...MONO, color: T.textSubtle }}>
                ◇
              </span>
              <p className="text-sm font-medium" style={{ color: T.text }}>
                Sin reparto aún
              </p>
              <p className="text-xs" style={{ color: T.textSubtle }}>
                A medida que asignes, verás quién tiene qué.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filas.map((entry) => (
                <DistRow key={entry.operadorId} entry={entry} max={maxCarga} />
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
