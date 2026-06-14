import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCrearSolicitud } from "@/lib/api/queries";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/MoneyText";
import { StepCliente, type ClienteElegido } from "./wizard/StepCliente";
import { StepPrestamo, type DatosPrestamo } from "./wizard/StepPrestamo";

type Paso = "cliente" | "prestamo" | "confirmar" | "listo";

const PASOS: { key: Paso; label: string }[] = [
  { key: "cliente", label: "Cliente" },
  { key: "prestamo", label: "Préstamo" },
  { key: "confirmar", label: "Confirmar" },
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-text">Originar préstamo</h1>
        <p className="text-sm text-text-muted">
          Cargá un cliente y armá su solicitud paso a paso.
        </p>
      </header>

      {paso !== "listo" && <Stepper pasos={PASOS} activo={idxActual} />}

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
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-text">Revisá y confirmá</h2>
          <Card>
            <CardTitle>Resumen</CardTitle>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Dato label="Cliente" valor={cliente.nombre} />
              <Dato label="DNI" valor={cliente.dni || "—"} />
              <Dato label="Producto" valor={prestamo.productoNombre} />
              <Dato label="Cuotas" valor={`${prestamo.cantidadCuotas}`} />
              <div>
                <dt className="text-xs text-text-subtle">Monto</dt>
                <dd>
                  <MoneyText
                    value={prestamo.monto}
                    intent="neutral"
                    className="font-semibold"
                  />
                </dd>
              </div>
            </dl>
          </Card>

          {crearError && (
            <p role="alert" className="text-sm text-neg">
              {crearError}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setPaso("prestamo")}>
              ← Volver
            </Button>
            <Button onClick={confirmar} disabled={crear.isPending}>
              {crear.isPending ? "Creando…" : "Crear solicitud"}
            </Button>
          </div>
        </div>
      )}

      {paso === "listo" && solicitudId && (
        <Card className="space-y-4 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pos-bg text-pos">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text">Solicitud creada</h2>
            <p className="text-sm text-text-muted">
              Queda en borrador para que un analista la evalúe y desembolse.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => navigate({ to: `/solicitudes/${solicitudId}` as string })}>
              Ver la solicitud
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCliente(null);
                setPrestamo(null);
                setSolicitudId(null);
                crear.reset();
                setPaso("cliente");
              }}
            >
              Originar otra
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({
  pasos,
  activo,
}: {
  pasos: { key: string; label: string }[];
  activo: number;
}) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progreso">
      {pasos.map((p, i) => {
        const estado = i < activo ? "hecho" : i === activo ? "actual" : "pendiente";
        return (
          <li key={p.key} className="flex flex-1 items-center gap-2">
            <span
              aria-current={estado === "actual" ? "step" : undefined}
              className={[
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                estado === "hecho"
                  ? "bg-brand text-brand-foreground"
                  : estado === "actual"
                    ? "bg-brand-subtle text-brand ring-2 ring-brand"
                    : "bg-surface-sunken text-text-subtle",
              ].join(" ")}
            >
              {i + 1}
            </span>
            <span
              className={[
                "text-sm",
                estado === "pendiente" ? "text-text-subtle" : "font-medium text-text",
              ].join(" ")}
            >
              {p.label}
            </span>
            {i < pasos.length - 1 && (
              <span className="mx-1 h-px flex-1 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-text-subtle">{label}</dt>
      <dd className="font-medium text-text">{valor}</dd>
    </div>
  );
}
