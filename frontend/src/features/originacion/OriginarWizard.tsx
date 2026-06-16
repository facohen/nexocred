import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCrearSolicitud } from "@/lib/api/queries";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/MoneyText";
import { StepCliente, type ClienteElegido } from "./wizard/StepCliente";
import { StepPrestamo, type DatosPrestamo } from "./wizard/StepPrestamo";

type Paso = "cliente" | "prestamo" | "confirmar" | "listo";

const PASOS: { key: Paso; label: string; hint: string }[] = [
  { key: "cliente", label: "Cliente", hint: "Quién recibe el préstamo" },
  { key: "prestamo", label: "Préstamo", hint: "Producto, monto y cuotas" },
  { key: "confirmar", label: "Confirmar", hint: "Revisión final" },
];

/**
 * Asistente de originación (el corazón del sistema). Guía: elegir/crear cliente
 * → condiciones del préstamo → confirmar y crear la solicitud. La solicitud
 * queda en borrador para que un analista la evalúe y desembolse (flujo híbrido).
 * Reusa endpoints existentes; el único hook nuevo es useCrearSolicitud.
 */
export function OriginarWizard() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState<Paso>("cliente");
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  const [prestamo, setPrestamo] = useState<DatosPrestamo | null>(null);
  const [solicitudId, setSolicitudId] = useState<string | null>(null);

  const crear = useCrearSolicitud();
  const crearError =
    crear.error instanceof ApiError
      ? crear.error.message
      : crear.error
        ? "No se pudo crear la solicitud"
        : null;

  async function confirmar() {
    if (!cliente || !prestamo) return;
    try {
      const sol = await crear.mutateAsync({
        persona_id: cliente.id,
        producto_id: prestamo.productoId,
        monto: prestamo.monto,
        cantidad_cuotas: prestamo.cantidadCuotas,
        // El backend atribuye el vendedor automáticamente; admin/analista quedan
        // sin vendedor salvo que se complete por otra vía.
      });
      setSolicitudId(sol.id);
      setPaso("listo");
    } catch {
      // el error se muestra vía crearError
    }
  }

  const idxActual = PASOS.findIndex((p) => p.key === paso);
  const enListo = paso === "listo";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-8 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wider text-text-subtle">
            Originación
          </span>
        </div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-text">
          Originar préstamo
        </h1>
        <p className="text-sm text-text-muted">Cargá un cliente y armá su solicitud paso a paso.</p>
      </header>

      {!enListo && <Stepper pasos={PASOS} activo={idxActual} />}

      <div className="mt-7">
        {paso === "cliente" && (
          <StepCliente
            onElegir={(c) => {
              setCliente(c);
              setPaso("prestamo");
            }}
          />
        )}

        {paso === "prestamo" && (
          <StepPrestamo
            valorInicial={prestamo ?? undefined}
            onVolver={() => setPaso("cliente")}
            onConfirmar={(datos) => {
              setPrestamo(datos);
              setPaso("confirmar");
            }}
          />
        )}

        {paso === "confirmar" && cliente && prestamo && (
          <PasoConfirmar
            cliente={cliente}
            prestamo={prestamo}
            error={crearError}
            enviando={crear.isPending}
            onVolver={() => setPaso("prestamo")}
            onConfirmar={confirmar}
          />
        )}

        {enListo && solicitudId && (
          <PasoListo
            onVer={() => navigate({ to: `/solicitudes/${solicitudId}` as string })}
            onOtra={() => {
              setCliente(null);
              setPrestamo(null);
              setSolicitudId(null);
              crear.reset();
              setPaso("cliente");
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Stepper: dots + connecting line, color por estado ────────────────────── */

function Stepper({
  pasos,
  activo,
}: {
  pasos: { key: string; label: string; hint: string }[];
  activo: number;
}) {
  return (
    <nav aria-label="Progreso del asistente">
      <ol className="flex items-start">
        {pasos.map((p, i) => {
          const hecho = i < activo;
          const actual = i === activo;
          const esUltimo = i === pasos.length - 1;
          return (
            <li key={p.key} className="flex flex-1 flex-col">
              <div className="flex items-center">
                <span
                  aria-current={actual ? "step" : undefined}
                  className={[
                    "relative grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-all duration-200",
                    hecho
                      ? "border-pos bg-pos text-white"
                      : actual
                        ? "border-brand bg-surface text-brand shadow-sm ring-4 ring-brand-subtle"
                        : "border-border bg-surface text-text-subtle",
                  ].join(" ")}
                >
                  {hecho ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <span
                      className={[
                        "h-2 w-2 rounded-full transition-colors",
                        actual ? "bg-brand" : "bg-border-strong",
                      ].join(" ")}
                      aria-hidden
                    />
                  )}
                </span>

                {!esUltimo && (
                  <span className="relative mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                    <span
                      className={[
                        "absolute inset-0 origin-left rounded-full bg-pos transition-transform duration-300 ease-out",
                        hecho ? "scale-x-100" : "scale-x-0",
                      ].join(" ")}
                      aria-hidden
                    />
                  </span>
                )}
              </div>

              <div className="mt-2 pr-2">
                <div
                  className={[
                    "text-xs font-semibold leading-none transition-colors",
                    hecho || actual ? "text-text" : "text-text-subtle",
                  ].join(" ")}
                >
                  {p.label}
                </div>
                <div className="mt-1 hidden text-[11px] leading-tight text-text-subtle sm:block">
                  {p.hint}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Paso confirmar: review card con monto hero ───────────────────────────── */

function PasoConfirmar({
  cliente,
  prestamo,
  error,
  enviando,
  onVolver,
  onConfirmar,
}: {
  cliente: ClienteElegido;
  prestamo: DatosPrestamo;
  error: string | null;
  enviando: boolean;
  onVolver: () => void;
  onConfirmar: () => void;
}) {
  const iniciales = inicialesDe(cliente.nombre);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-text">Revisá y confirmá</h2>
        <p className="mt-0.5 text-sm text-text-muted">
          Verificá los datos antes de generar la solicitud.
        </p>
      </div>

      <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {/* Banda de monto: el número como héroe */}
        <div className="border-b border-border bg-surface-sunken px-6 py-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
            Monto solicitado
          </div>
          <div className="mt-1.5">
            <MoneyText
              value={prestamo.monto}
              intent="neutral"
              className="text-[32px] font-semibold leading-none tracking-tight"
            />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
            <span className="font-num tabular-nums text-text">{prestamo.cantidadCuotas}</span>
            <span>cuotas · {prestamo.productoNombre}</span>
          </div>
        </div>

        {/* Identidad del cliente */}
        <div className="flex items-center gap-3 px-6 py-4">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-subtle text-sm font-semibold text-brand"
          >
            {iniciales}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text">{cliente.nombre}</div>
            <div className="text-xs text-text-muted">
              {cliente.dni ? (
                <>
                  DNI <span className="font-num tabular-nums text-text-muted">{cliente.dni}</span>
                </>
              ) : (
                "Cliente nuevo"
              )}
            </div>
          </div>
        </div>

        {/* Detalle */}
        <dl className="divide-y divide-border border-t border-border">
          <Fila label="Producto" valor={prestamo.productoNombre} />
          <Fila label="Cuotas" valor={`${prestamo.cantidadCuotas}`} mono />
          <Fila label="DNI" valor={cliente.dni || "—"} mono />
        </dl>
      </article>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-neg-border bg-neg-bg px-4 py-3"
        >
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 h-4 w-4 shrink-0 text-neg"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div className="text-sm">
            <div className="font-medium text-neg">No se pudo crear la solicitud</div>
            <p className="mt-0.5 text-neg/90">{error}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        <Button variant="ghost" onClick={onVolver} disabled={enviando}>
          ← Volver
        </Button>
        <Button onClick={onConfirmar} disabled={enviando} className="min-w-[9.5rem]">
          {enviando ? "Creando…" : "Crear solicitud"}
        </Button>
      </div>
    </div>
  );
}

function Fila({ label, valor, mono = false }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd
        className={[
          "min-w-0 truncate text-right text-sm font-medium text-text",
          mono ? "font-num tabular-nums" : "",
        ].join(" ")}
      >
        {valor}
      </dd>
    </div>
  );
}

/* ── Paso listo: confirmación pos ─────────────────────────────────────────── */

function PasoListo({ onVer, onOtra }: { onVer: () => void; onOtra: () => void }) {
  return (
    <div className="mx-auto max-w-lg">
      <article className="overflow-hidden rounded-xl border border-pos-border bg-surface shadow-sm">
        <div className="flex flex-col items-center px-6 py-9 text-center">
          <div className="relative mb-5">
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-full bg-pos-bg opacity-60"
            />
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-pos-bg text-pos ring-1 ring-pos-border">
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-text">Solicitud creada</h2>
          <p className="mt-1.5 max-w-xs text-sm text-text-muted">
            Queda en borrador para que un analista la evalúe y desembolse.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border bg-surface-sunken px-6 py-4 sm:flex-row sm:justify-center">
          <Button onClick={onVer}>Ver la solicitud</Button>
          <Button variant="outline" onClick={onOtra}>
            Originar otra
          </Button>
        </div>
      </article>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
