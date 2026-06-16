import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSolicitudes, useMetaVendedor } from "@/lib/api/queries";
import { useLiquidaciones } from "@/features/vendedores/hooks";
import { getToken, decodeUserIdFromToken, getSessionUser } from "@/lib/auth";
import { addMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/MoneyText";
import { WorkInboxHero } from "@/components/WorkInbox";
import type { components } from "@/lib/api/schema";

type Meta = components["schemas"]["MetaVendedorOut"];

// Período actual 'YYYY-MM' (mismo formato Text que el backend de metas; orden
// lexicográfico == cronológico). Sin Date.now en módulo: se calcula al render.
function periodoActual(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

// Estados que cuentan como "cerrada con éxito" para la tasa de conversión.
const ESTADOS_GANADOS = new Set(["aprobada", "desembolsada"]);
const ESTADOS_PERDIDOS = new Set(["rechazada", "desistida"]);

/**
 * Inicio del VENDEDOR: su dashboard de performance. Reúne la meta del mes, el
 * estado de su pipeline, la conversión y sus comisiones, más accesos rápidos a
 * su trabajo. Es la landing del rol; "Originar" es solo el wizard de carga de
 * un crédito nuevo (sin listado ni tabs).
 */
export function VendedorHome() {
  const navigate = useNavigate();
  const solicitudesQ = useSolicitudes();
  const liquidacionesQ = useLiquidaciones();

  const usuario = getSessionUser();
  const vendedorId = decodeUserIdFromToken(getToken()?.access_token);
  const periodo = periodoActual();
  const metaQ = useMetaVendedor(vendedorId, periodo);

  const solicitudes = useMemo(() => solicitudesQ.data?.data ?? [], [solicitudesQ.data]);

  // Conteo por estado del pipeline, derivado en el front sobre las solicitudes
  // ya scopeadas al vendedor por el backend.
  const porEstado = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of solicitudes) {
      map.set(s.estado, (map.get(s.estado) ?? 0) + 1);
    }
    return map;
  }, [solicitudes]);

  // Conversión = ganadas / (ganadas + perdidas). Las solicitudes en curso no
  // entran al denominador: la tasa mide resultados cerrados, no el pipeline vivo.
  const conversion = useMemo(() => {
    let ganadas = 0;
    let perdidas = 0;
    for (const s of solicitudes) {
      if (ESTADOS_GANADOS.has(s.estado)) ganadas += 1;
      else if (ESTADOS_PERDIDOS.has(s.estado)) perdidas += 1;
    }
    const cerradas = ganadas + perdidas;
    return { ganadas, perdidas, pct: cerradas === 0 ? null : Math.round((ganadas / cerradas) * 100) };
  }, [solicitudes]);

  // Comisiones: useComisiones(vendedorId) trae el detalle, pero como resumen
  // honesto del home usamos las liquidaciones ya pagadas (suma de monto_total) y
  // dejamos el desglose a un clic.
  const liquidacionesPagadas = (liquidacionesQ.data ?? []).filter((l) => l.estado === "pagada");
  const totalComisionesPagadas = liquidacionesPagadas.reduce(
    (acc, l) => addMoney(acc, l.monto_total),
    "0",
  );

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title={usuario?.nombre ? `Hola, ${primerNombre(usuario.nombre)}` : "Mi performance"}
        subtitle="Cómo venís este mes, de un vistazo."
        action={
          <Button size="lg" onClick={() => navigate({ to: "/originar" as string })}>
            + Nuevo crédito
          </Button>
        }
      />

      <MetaHero meta={metaQ.data} cargando={metaQ.isLoading} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiPipeline
          porEstado={porEstado}
          total={solicitudes.length}
          onVer={() => navigate({ to: "/originar" as string })}
        />
        <KpiConversion conversion={conversion} />
        <KpiComisiones
          total={totalComisionesPagadas}
          cantidad={liquidacionesPagadas.length}
          onVer={() => navigate({ to: "/vendedores/comisiones" as string })}
        />
      </div>

      <AccesosRapidos
        onOriginar={() => navigate({ to: "/originar" as string })}
        onClientes={() => navigate({ to: "/mis-clientes" as string })}
        onCreditos={() => navigate({ to: "/mis-creditos" as string })}
        onGestiones={() => navigate({ to: "/gestiones" as string })}
      />
    </div>
  );
}

function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

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
            <MoneyText value={meta.monto_colocado} intent="income" className="text-2xl font-bold" />
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

const ESTADO_LABEL: Record<string, string> = {
  ingresada: "Ingresadas",
  en_evaluacion: "En evaluación",
  evaluada: "Evaluadas",
  aprobada: "Aprobadas",
  desembolsada: "Desembolsadas",
  rechazada: "Rechazadas",
  desistida: "Desistidas",
};

function KpiPipeline({
  porEstado,
  total,
  onVer,
}: {
  porEstado: Map<string, number>;
  total: number;
  onVer: () => void;
}) {
  const filas = [...porEstado.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <Card className="flex flex-col">
      <CardTitle>Mi pipeline</CardTitle>
      <div className="text-3xl font-bold text-text">{total}</div>
      <div className="mb-3 text-xs text-text-subtle">solicitudes en total</div>
      {filas.length === 0 ? (
        <p className="text-sm text-text-subtle">Sin solicitudes todavía.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {filas.map(([estado, n]) => (
            <li key={estado} className="flex items-center justify-between">
              <span className="text-text-muted">{ESTADO_LABEL[estado] ?? estado}</span>
              <span className="font-medium tabular-nums text-text">{n}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onVer}
        className="mt-auto pt-3 text-left text-sm text-brand hover:underline"
      >
        Ver pipeline →
      </button>
    </Card>
  );
}

function KpiConversion({
  conversion,
}: {
  conversion: { ganadas: number; perdidas: number; pct: number | null };
}) {
  return (
    <Card className="flex flex-col">
      <CardTitle>Conversión</CardTitle>
      <div className="text-3xl font-bold text-text">
        {conversion.pct == null ? "—" : `${conversion.pct}%`}
      </div>
      <div className="mb-3 text-xs text-text-subtle">de solicitudes cerradas</div>
      <ul className="space-y-1 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-text-muted">Ganadas</span>
          <span className="font-medium tabular-nums text-pos">{conversion.ganadas}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-text-muted">Perdidas</span>
          <span className="font-medium tabular-nums text-neg">{conversion.perdidas}</span>
        </li>
      </ul>
      {conversion.pct == null && (
        <p className="mt-2 text-xs text-text-subtle">
          Todavía no cerraste solicitudes este período.
        </p>
      )}
    </Card>
  );
}

function KpiComisiones({
  total,
  cantidad,
  onVer,
}: {
  total: string;
  cantidad: number;
  onVer: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardTitle>Comisiones</CardTitle>
      <MoneyText value={total} intent="income" className="text-3xl font-bold" />
      <div className="mb-3 text-xs text-text-subtle">
        {cantidad > 0
          ? `${cantidad} liquidación${cantidad === 1 ? "" : "es"} pagada${cantidad === 1 ? "" : "s"}`
          : "Aún sin liquidaciones pagadas."}
      </div>
      <button
        type="button"
        onClick={onVer}
        className="mt-auto pt-3 text-left text-sm text-brand hover:underline"
      >
        Ver detalle →
      </button>
    </Card>
  );
}

function AccesosRapidos({
  onOriginar,
  onClientes,
  onCreditos,
  onGestiones,
}: {
  onOriginar: () => void;
  onClientes: () => void;
  onCreditos: () => void;
  onGestiones: () => void;
}) {
  const accesos: { label: string; desc: string; onClick: () => void }[] = [
    { label: "Originar", desc: "Cargar una nueva solicitud", onClick: onOriginar },
    { label: "Mis clientes", desc: "Buscar y dar de alta", onClick: onClientes },
    { label: "Mis créditos", desc: "Estado de pagos", onClick: onCreditos },
    { label: "Gestiones", desc: "Tickets y seguimiento", onClick: onGestiones },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {accesos.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className="rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:bg-surface-sunken hover:border-border-strong"
        >
          <div className="text-sm font-semibold text-text">{a.label}</div>
          <div className="text-xs text-text-subtle">{a.desc}</div>
        </button>
      ))}
    </div>
  );
}
