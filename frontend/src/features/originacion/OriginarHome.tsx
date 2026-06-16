import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSolicitudes, usePersonas, useProductos } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import { WorkInbox, WorkInboxHero, InboxRow, type InboxSection } from "@/components/WorkInbox";
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

/**
 * "Originar" del VENDEDOR: su pipeline de solicitudes + acción de nueva
 * solicitud. Enfocada: las metas, conversión y comisiones viven en el Inicio
 * (VendedorHome); acá solo el pipeline, agrupado por etapa. Las solicitudes
 * vienen scopeadas al vendedor por el backend.
 */
export function OriginarHome() {
  const navigate = useNavigate();
  const solicitudesQ = useSolicitudes();
  const personasQ = usePersonas();
  const productosQ = useProductos();

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

  // Pipeline agrupado por etapa: en curso (lo accionable) arriba, cerradas abajo.
  const sections = useMemo<InboxSection<Solicitud>[]>(() => {
    const enCurso: Solicitud[] = [];
    const cerradas: Solicitud[] = [];
    const cerradoEstados = new Set(["aprobada", "desembolsada", "rechazada", "desistida"]);
    for (const s of solicitudesQ.data?.data ?? []) {
      if (cerradoEstados.has(s.estado)) cerradas.push(s);
      else enCurso.push(s);
    }
    return [
      {
        id: "en-curso",
        title: "En curso",
        items: enCurso,
        emptyText: "No tenés solicitudes en curso. Creá una nueva para empezar.",
      },
      {
        id: "cerradas",
        title: "Cerradas",
        items: cerradas,
        emptyText: "Todavía no cerraste solicitudes.",
      },
    ];
  }, [solicitudesQ.data]);

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

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Originar"
        subtitle="Tu pipeline de solicitudes, de punta a punta."
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
              signals={<Badge tone={ESTADO_TONE[s.estado] ?? "default"}>{s.estado}</Badge>}
              onClick={() => navigate({ to: `/solicitudes/${s.id}` as string })}
            />
          );
        }}
      />
    </div>
  );
}
