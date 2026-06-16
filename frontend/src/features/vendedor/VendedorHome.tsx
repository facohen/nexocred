import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSolicitudes, useMetaVendedor } from "@/lib/api/queries";
import { useLiquidaciones } from "@/features/vendedores/hooks";
import { getToken, decodeUserIdFromToken, getSessionUser } from "@/lib/auth";
import { addMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/MoneyText";
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
    return {
      ganadas,
      perdidas,
      pct: cerradas === 0 ? null : Math.round((ganadas / cerradas) * 100),
    };
  }, [solicitudes]);

  // Comisiones: useComisiones(vendedorId) trae el detalle, pero como resumen
  // honesto del home usamos las liquidaciones ya pagadas (suma de monto_total) y
  // dejamos el desglose a un clic.
  const liquidacionesPagadas = (liquidacionesQ.data ?? []).filter((l) => l.estado === "pagada");
  const totalComisionesPagadas = liquidacionesPagadas.reduce(
    (acc, l) => addMoney(acc, l.monto_total),
    "0",
  );

  const saludo = usuario?.nombre ? primerNombre(usuario.nombre) : null;

  return (
    <div className="space-y-8">
      <Saludo
        nombre={saludo}
        periodo={periodo}
        onOriginar={() => navigate({ to: "/originar" as string })}
      />

      {/* Bento asimétrico: la meta del mes domina (3 col), las comisiones la
          acompañan a la derecha (2 col). En mobile apilan. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MetaHero meta={metaQ.data} cargando={metaQ.isLoading} />
        </div>
        <div className="lg:col-span-2">
          <ComisionesPanel
            total={totalComisionesPagadas}
            cantidad={liquidacionesPagadas.length}
            cargando={liquidacionesQ.isLoading}
            onVer={() => navigate({ to: "/vendedores/comisiones" as string })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiPipeline
          porEstado={porEstado}
          total={solicitudes.length}
          cargando={solicitudesQ.isLoading}
          onVer={() => navigate({ to: "/originar" as string })}
        />
        <KpiConversion conversion={conversion} />
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

const NOMBRE_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split("-");
  const idx = Number(mes) - 1;
  const nombre = NOMBRE_MES[idx] ?? mes;
  return `${nombre} ${anio}`;
}

/** Encabezado personal: saludo grande + el mes en curso, acción primaria a la derecha. */
function Saludo({
  nombre,
  periodo,
  onOriginar,
}: {
  nombre: string | null;
  periodo: string;
  onOriginar: () => void;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-widest text-text-subtle">
          {etiquetaPeriodo(periodo)}
        </p>
        <h1 className="mt-1 truncate text-3xl font-bold leading-tight text-text">
          {nombre ? `Hola, ${nombre}` : "Mi performance"}
        </h1>
        <p className="mt-1 text-sm text-text-muted">Así venís este mes, de un vistazo.</p>
      </div>
      <Button size="lg" onClick={onOriginar} className="shrink-0">
        + Nuevo crédito
      </Button>
    </header>
  );
}

/**
 * Pieza dominante del tablero: la meta del mes. Surface tintado de marca, número
 * colocado enorme en mono, anillo de avance con strip de estado y barra.
 */
function MetaHero({ meta, cargando }: { meta?: Meta; cargando: boolean }) {
  if (cargando) {
    return (
      <div className="h-full rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-sunken" />
        <div className="mt-4 h-10 w-48 animate-pulse rounded bg-surface-sunken" />
        <div className="mt-6 h-2 w-full animate-pulse rounded-full bg-surface-sunken" />
      </div>
    );
  }
  if (!meta) return null;

  const tieneMeta = Number(meta.monto_meta) > 0;
  // porcentaje_avance ya viene calculado por el backend (string, 1 decimal).
  const pct = Math.max(0, Math.min(100, Number(meta.porcentaje_avance) || 0));
  const cumplida = pct >= 100;
  // El color de la barra SEÑALA el ritmo: verde si va sobre el objetivo,
  // ámbar si está en zona media, marca por defecto al arrancar.
  const barClass = cumplida ? "bg-pos" : pct >= 50 ? "bg-brand" : "bg-warn";

  return (
    <section className="relative h-full overflow-hidden rounded-xl border border-border bg-brand-subtle/40 p-6 shadow-sm">
      {/* Strip de marca a la izquierda: ancla la jerarquía de la pieza. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />

      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-brand">
          Mi meta del mes
        </h2>
        {tieneMeta && (
          <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-num text-xs font-semibold text-text-muted">
            {pct.toFixed(0)}%
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <MoneyText
          value={meta.monto_colocado}
          intent="income"
          className="text-4xl font-bold leading-none tracking-tight"
        />
        {tieneMeta && (
          <span className="text-sm text-text-muted">
            de <MoneyText value={meta.monto_meta} className="font-medium" />
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-text-subtle">
        <span className="font-num font-semibold text-text-muted">{meta.cantidad_colocada}</span>{" "}
        préstamo{meta.cantidad_colocada === 1 ? "" : "s"} colocado
        {meta.cantidad_colocada === 1 ? "" : "s"}
        {meta.cantidad_meta != null ? (
          <>
            {" · objetivo "}
            <span className="font-num font-semibold text-text-muted">{meta.cantidad_meta}</span>
          </>
        ) : null}
      </p>

      {tieneMeta ? (
        <div className="mt-6">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avance de la meta"
          >
            <div
              className={`h-full rounded-full ${barClass} transition-[width] duration-slow`}
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-text-muted">
            {cumplida ? (
              <span className="text-pos">¡Meta cumplida! Seguís sumando.</span>
            ) : (
              <>
                Te falta{" "}
                <span className="font-num font-semibold text-text">{(100 - pct).toFixed(0)}%</span>{" "}
                para llegar al objetivo.
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-border bg-surface/60 p-3 text-xs text-text-subtle">
          No tenés una meta fijada este mes. Pedile a tu administrador que la cargue.
        </p>
      )}
    </section>
  );
}

/** Panel de comisiones cobradas: número de marca grande, CTA a detalle. */
function ComisionesPanel({
  total,
  cantidad,
  cargando,
  onVer,
}: {
  total: string;
  cantidad: number;
  cargando: boolean;
  onVer: () => void;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-surface p-6 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Comisiones cobradas
        </h2>
      </div>

      {cargando ? (
        <div className="mt-4 h-9 w-40 animate-pulse rounded bg-surface-sunken" />
      ) : (
        <MoneyText
          value={total}
          intent="income"
          className="mt-4 text-3xl font-bold leading-none tracking-tight"
        />
      )}

      <p className="mt-2 text-xs text-text-subtle">
        {cantidad > 0 ? (
          <>
            <span className="font-num font-semibold text-text-muted">{cantidad}</span> liquidación
            {cantidad === 1 ? "" : "es"} pagada{cantidad === 1 ? "" : "s"}
          </>
        ) : (
          "Aún sin liquidaciones pagadas."
        )}
      </p>

      <button
        type="button"
        onClick={onVer}
        className="mt-auto pt-4 text-left text-sm font-medium text-brand transition-colors hover:text-brand-hover"
      >
        Ver detalle →
      </button>
    </section>
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

// Color del punto por familia de estado: ganados verde, perdidos rojo, en curso
// ámbar. El color SEÑALA en qué punto del embudo está cada solicitud.
function colorEstado(estado: string): string {
  if (ESTADOS_GANADOS.has(estado)) return "bg-pos";
  if (ESTADOS_PERDIDOS.has(estado)) return "bg-neg";
  return "bg-warn";
}

function KpiPipeline({
  porEstado,
  total,
  cargando,
  onVer,
}: {
  porEstado: Map<string, number>;
  total: number;
  cargando: boolean;
  onVer: () => void;
}) {
  const filas = [...porEstado.entries()].sort((a, b) => b[1] - a[1]);
  const max = filas.length ? filas[0][1] : 0;

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Mi pipeline
        </h2>
        <div className="font-num text-3xl font-bold leading-none tracking-tight text-text">
          {cargando ? "—" : total}
        </div>
      </div>
      <p className="mt-1 text-xs text-text-subtle">solicitudes en total</p>

      <div className="mt-4 flex-1">
        {filas.length === 0 ? (
          <p className="text-sm text-text-subtle">
            Sin solicitudes todavía. Originá la primera para arrancar tu pipeline.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {filas.map(([estado, n]) => (
              <li key={estado} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${colorEstado(estado)}`}
                />
                <span className="w-32 shrink-0 truncate text-sm text-text-muted">
                  {ESTADO_LABEL[estado] ?? estado}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className={`block h-full rounded-full ${colorEstado(estado)} opacity-70`}
                    style={{ width: `${max ? (n / max) * 100 : 0}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right font-num text-sm font-semibold text-text">
                  {n}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onVer}
        className="mt-4 text-left text-sm font-medium text-brand transition-colors hover:text-brand-hover"
      >
        Ver pipeline →
      </button>
    </section>
  );
}

function KpiConversion({
  conversion,
}: {
  conversion: { ganadas: number; perdidas: number; pct: number | null };
}) {
  const { ganadas, perdidas, pct } = conversion;
  const totalCerradas = ganadas + perdidas;
  // Intent del número grande según la tasa: buena ≥60, floja <40, media en medio.
  const intentClass =
    pct == null
      ? "text-text-subtle"
      : pct >= 60
        ? "text-pos"
        : pct >= 40
          ? "text-warn"
          : "text-neg";

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Conversión
        </h2>
        <div className={`font-num text-3xl font-bold leading-none tracking-tight ${intentClass}`}>
          {pct == null ? "—" : `${pct}%`}
        </div>
      </div>
      <p className="mt-1 text-xs text-text-subtle">de solicitudes cerradas</p>

      <div className="mt-4 flex-1">
        {/* Barra ganadas vs perdidas: lectura visual del balance del embudo. */}
        {totalCerradas > 0 ? (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <span
                className="block h-full bg-pos"
                style={{ width: `${(ganadas / totalCerradas) * 100}%` }}
              />
              <span
                className="block h-full bg-neg"
                style={{ width: `${(perdidas / totalCerradas) * 100}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-pos" />
                <span className="text-text-muted">Ganadas</span>
                <span className="font-num font-semibold text-pos">{ganadas}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-num font-semibold text-neg">{perdidas}</span>
                <span className="text-text-muted">Perdidas</span>
                <span aria-hidden className="h-2 w-2 rounded-full bg-neg" />
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-subtle">
            Todavía no cerraste solicitudes este período. Tu tasa aparece cuando aprobás o perdés la
            primera.
          </p>
        )}
      </div>
    </section>
  );
}

// Accesos rápidos: "Originar" es la acción protagonista (tinte de marca, ancho
// doble en desktop); el resto son secundarias y de igual peso entre sí.
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
  const secundarios: { label: string; desc: string; onClick: () => void }[] = [
    { label: "Mis clientes", desc: "Buscar y dar de alta", onClick: onClientes },
    { label: "Mis créditos", desc: "Estado de pagos", onClick: onCreditos },
    { label: "Gestiones", desc: "Tickets y seguimiento", onClick: onGestiones },
  ];

  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-subtle">
        Accesos rápidos
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={onOriginar}
          className="group col-span-2 flex flex-col justify-between rounded-xl border border-brand/20 bg-brand-subtle/50 p-5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-brand-subtle hover:shadow-md"
        >
          <div className="text-base font-bold text-brand">Originar crédito</div>
          <div className="mt-1 text-sm text-text-muted">
            Cargá una nueva solicitud
            <span className="ml-1 inline-block transition-transform duration-150 group-hover:translate-x-0.5">
              →
            </span>
          </div>
        </button>
        {secundarios.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
          >
            <div className="text-sm font-semibold text-text">{a.label}</div>
            <div className="mt-0.5 text-xs text-text-subtle">{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
