import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useSolicitudes,
  usePersonas,
  useProductos,
  useMetaVendedor,
} from "@/lib/api/queries";
import { useLiquidaciones } from "@/features/vendedores/hooks";
import { getToken, decodeUserIdFromToken } from "@/lib/auth";
import { addMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/MoneyText";
import {
  WorkInbox,
  WorkInboxHero,
  InboxRow,
  type InboxSection,
} from "@/components/WorkInbox";
import type { components } from "@/lib/api/schema";

type Solicitud = components["schemas"]["SolicitudOut"];

// Período actual 'YYYY-MM' (mismo formato Text que el backend de metas; orden
// lexicográfico == cronológico). Sin Date.now en módulo: se calcula al render.
function periodoActual(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

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

  // Id del vendedor desde el JWT (sub). La sesión no lo duplica; las metas y la
  // cartera están scopeadas a este id.
  const vendedorId = decodeUserIdFromToken(getToken()?.access_token);
  const periodo = periodoActual();
  const metaQ = useMetaVendedor(vendedorId, periodo);

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

  // Mi cartera = clientes detrás de mis solicitudes. Las solicitudes ya vienen
  // scopeadas al vendedor por el backend (el listado respeta el rol); derivamos
  // las personas distintas, con su última solicitud como contexto. Sin endpoint
  // agregador: join en el front sobre datos ya cargados. (Hook antes de los
  // early returns para respetar las Rules of Hooks.)
  const cartera = useMemo(() => {
    const porPersona = new Map<string, ClienteCartera>();
    for (const s of solicitudesQ.data?.data ?? []) {
      if (!porPersona.get(s.persona_id)) {
        porPersona.set(s.persona_id, {
          personaId: s.persona_id,
          nombre:
            nombrePorPersona.get(s.persona_id) ?? `Cliente ${idCorto(s.persona_id)}`,
          ultima: s,
        });
      }
    }
    return [...porPersona.values()];
  }, [solicitudesQ.data, nombrePorPersona]);

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
          <Button size="lg" onClick={() => navigate({ to: "/originar/nuevo" as string })}>
            + Nueva solicitud
          </Button>
        }
      />

      <MetaHero meta={metaQ.data} cargando={metaQ.isLoading} />

      <CarteraClientes
        cartera={cartera}
        onAbrir={(personaId) => navigate({ to: `/personas/${personaId}` as string })}
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

type Meta = components["schemas"]["MetaVendedorOut"];

/** KPI hero de metas del período: colocado vs meta, barra de avance. */
function MetaHero({ meta, cargando }: { meta?: Meta; cargando: boolean }) {
  if (cargando) {
    return (
      <Card>
        <p className="animate-pulse text-sm text-text-subtle">Cargando tus metas…</p>
      </Card>
    );
  }
  if (!meta) return null;

  const tieneMeta = Number(meta.monto_meta) > 0;
  // porcentaje_avance ya viene calculado por el backend (string, 1 decimal).
  const pct = Math.max(0, Math.min(100, Number(meta.porcentaje_avance) || 0));

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <CardTitle className="mb-1">Mi meta del mes</CardTitle>
          <div className="flex items-baseline gap-2">
            <MoneyText
              value={meta.monto_colocado}
              intent="income"
              className="text-2xl font-bold"
            />
            {tieneMeta && (
              <span className="text-sm text-text-muted">
                de <MoneyText value={meta.monto_meta} className="font-medium" />
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-subtle">
            {meta.cantidad_colocada} préstamo{meta.cantidad_colocada === 1 ? "" : "s"} colocado
            {meta.cantidad_colocada === 1 ? "" : "s"}
            {meta.cantidad_meta != null ? ` · objetivo ${meta.cantidad_meta}` : ""}
          </p>
        </div>
        {tieneMeta && (
          <div className="text-right">
            <div className="text-2xl font-bold text-brand">{pct.toFixed(0)}%</div>
            <div className="text-xs text-text-subtle">del objetivo</div>
          </div>
        )}
      </div>

      {tieneMeta ? (
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance de la meta"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-normal"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs text-text-subtle">
          No tenés una meta fijada este mes. Pedile a tu administrador que la cargue.
        </p>
      )}
    </Card>
  );
}

type ClienteCartera = { personaId: string; nombre: string; ultima: Solicitud };

/** Mi cartera: los clientes detrás de mis solicitudes, accionables a un clic. */
function CarteraClientes({
  cartera,
  onAbrir,
}: {
  cartera: ClienteCartera[];
  onAbrir: (personaId: string) => void;
}) {
  return (
    <Card>
      <CardTitle>Mis clientes</CardTitle>
      {cartera.length === 0 ? (
        <p className="text-sm text-text-subtle">
          Todavía no tenés clientes. Originá una solicitud para sumar el primero.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {cartera.map((c) => (
            <li
              key={c.personaId}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5"
            >
              <div>
                <div className="text-sm font-medium text-text">{c.nombre}</div>
                <div className="text-xs text-text-subtle">
                  Última solicitud{" "}
                  <Badge tone={ESTADO_TONE[c.ultima.estado] ?? "default"}>
                    {c.ultima.estado}
                  </Badge>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onAbrir(c.personaId)}>
                Ver ficha
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
