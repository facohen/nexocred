import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSolicitudes, usePersonas, useProductos } from "@/lib/api/queries";
import { useLiquidaciones } from "@/features/vendedores/hooks";
import { addMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MoneyText } from "@/components/MoneyText";
import {
  WorkInbox,
  WorkInboxHero,
  InboxRow,
  type InboxSection,
} from "@/components/WorkInbox";
import type { components } from "@/lib/api/schema";

type Solicitud = components["schemas"]["SolicitudOut"];

const ESTADO_TONE: Record<string, "default" | "warning" | "success" | "danger"> = {
  ingresada: "default",
  en_evaluacion: "warning",
  evaluada: "warning",
  aprobada: "success",
  rechazada: "danger",
  desembolsada: "success",
};

function idCorto(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Home del VENDEDOR: pipeline de originación + acción primaria de nueva solicitud. */
export function OriginarHome() {
  const navigate = useNavigate();
  const solicitudesQ = useSolicitudes();
  const personasQ = usePersonas();
  const productosQ = useProductos();
  const liquidacionesQ = useLiquidaciones();

  const nombrePorPersona = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of personasQ.data?.data ?? []) {
      map.set(p.id, `${p.nombre} ${p.apellido}`.trim());
    }
    return map;
  }, [personasQ.data]);

  const nombrePorProducto = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of productosQ.data?.data ?? []) {
      map.set(p.id, p.nombre);
    }
    return map;
  }, [productosQ.data]);

  if (solicitudesQ.isLoading) {
    return <p className="p-4 text-sm text-text-muted">Cargando…</p>;
  }
  if (solicitudesQ.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudo cargar el pipeline.
      </p>
    );
  }

  const solicitudes = solicitudesQ.data?.data ?? [];

  const sections: InboxSection<Solicitud>[] = [
    {
      title: "Mi pipeline",
      items: solicitudes,
      emptyText: "No tenés solicitudes en curso. Creá una nueva para empezar.",
    },
  ];

  // Comisiones: useComisiones(vendedorId) requiere el id del vendedor, que la
  // sesión (useSession) no expone (solo email/nombre/roles). Como proxy honesto
  // usamos las liquidaciones ya pagadas (suma de monto_total) y dejamos el
  // detalle a un clic en /vendedores/comisiones.
  const liquidacionesPagadas = (liquidacionesQ.data ?? []).filter(
    (l) => l.estado === "pagada",
  );
  const totalComisionesPagadas = liquidacionesPagadas.reduce(
    (acc, l) => addMoney(acc, l.monto_total),
    "0",
  );

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Originar"
        subtitle="Tu pipeline de solicitudes, de punta a punta."
        action={
          <Button size="lg" onClick={() => navigate({ to: "/solicitudes" as string })}>
            + Nueva solicitud
          </Button>
        }
      />

      <WorkInbox
        sections={sections}
        keyFor={(s) => s.id}
        renderItem={(s) => {
          const nombre = nombrePorPersona.get(s.persona_id);
          const producto = nombrePorProducto.get(s.producto_id);
          return (
            <InboxRow
              title={nombre ?? `Solicitud #${idCorto(s.id)}`}
              context={
                <span>
                  {producto ? `${producto} · ` : ""}
                  <MoneyText value={s.monto ?? null} />
                </span>
              }
              signals={
                <Badge tone={ESTADO_TONE[s.estado] ?? "default"}>{s.estado}</Badge>
              }
              onClick={() => navigate({ to: `/solicitudes/${s.id}` as string })}
            />
          );
        }}
      />

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text">Comisiones</div>
            <div className="text-xs text-text-muted">
              {liquidacionesPagadas.length > 0
                ? `${liquidacionesPagadas.length} liquidacion${
                    liquidacionesPagadas.length === 1 ? "" : "es"
                  } pagada${liquidacionesPagadas.length === 1 ? "" : "s"}`
                : "Aún sin liquidaciones pagadas."}
            </div>
            {liquidacionesPagadas.length > 0 && (
              <MoneyText
                value={totalComisionesPagadas}
                intent="income"
                className="mt-1 block text-lg font-semibold"
              />
            )}
          </div>
          <a
            href="/vendedores/comisiones"
            onClick={(e) => {
              e.preventDefault();
              navigate({ to: "/vendedores/comisiones" as string });
            }}
            className="shrink-0 text-sm text-brand hover:underline"
          >
            Ver detalle
          </a>
        </div>
      </Card>
    </div>
  );
}
