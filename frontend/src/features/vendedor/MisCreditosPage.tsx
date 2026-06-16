import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePrestamos, usePersonas } from "@/lib/api/queries";
import { getToken, decodeUserIdFromToken } from "@/lib/auth";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/MoneyText";
import { addMoney } from "@/lib/money";
import { CarteraFilter, type OpcionEstado } from "@/components/filters/CarteraFilter";
import {
  type FiltroCartera,
  type AccessoresFiltro,
  FILTRO_CARTERA_VACIO,
  filtrarCartera,
} from "@/lib/filtros";
import type { components } from "@/lib/api/schema";

type Prestamo = components["schemas"]["PrestamoOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

// El monto del préstamo para filtrar/mostrar: lo desembolsado, o el capital si
// todavía no se desembolsó. Misma regla que la fila.
function montoPrestamo(p: Prestamo): string | null | undefined {
  return p.monto_desembolsado ?? p.capital;
}

// Accessors del filtro reutilizable sobre PrestamoOut (fecha = created_at).
const ACC_PRESTAMO: AccessoresFiltro<Prestamo> = {
  estado: (p) => p.estado,
  fecha: (p) => p.created_at,
  monto: montoPrestamo,
};

const ESTADO_LABEL: Record<string, string> = {
  vigente: "Vigente",
  al_dia: "Al día",
  en_mora: "En mora",
  pagado: "Pagado",
  cancelado: "Cancelado",
  refinanciado: "Refinanciado",
};

const ESTADO_TONO: Record<string, BadgeTone> = {
  vigente: "success",
  al_dia: "success",
  pagado: "default",
  cancelado: "default",
  en_mora: "danger",
  refinanciado: "info",
};

// Punto de riesgo por estado: mora = rojo, refinanciado = naranja (warn),
// pagado/cancelado = neutro, resto = verde (al día).
function riskDot(estado: string): "neg" | "warn" | "pos" | "muted" {
  if (estado === "en_mora") return "neg";
  if (estado === "refinanciado") return "warn";
  if (estado === "pagado" || estado === "cancelado") return "muted";
  return "pos";
}

const DOT_BG: Record<"neg" | "warn" | "pos" | "muted", string> = {
  neg: "bg-neg",
  warn: "bg-warn",
  pos: "bg-pos",
  muted: "bg-border-strong",
};

const esMora = (estado: string) => estado === "en_mora";
const esAlDia = (estado: string) => estado === "vigente" || estado === "al_dia";

function idCorto(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * "Mis créditos" del vendedor: los préstamos de SU cartera (backend scopea
 * GET /prestamos por vendedor). Lectura: el vendedor ve cómo viene cada cliente
 * con sus pagos; NO registra pagos (eso es de administrativo). Cada fila enlaza
 * a la ficha del cliente, donde está el estado de cuenta completo (cuotas/pagos).
 */
export function MisCreditosPage() {
  const navigate = useNavigate();
  const vendedorId = decodeUserIdFromToken(getToken()?.access_token) ?? undefined;
  const prestamosQ = usePrestamos({ vendedorId });
  const personasQ = usePersonas();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroCartera>(FILTRO_CARTERA_VACIO);

  const nombrePorPersona = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of personasQ.data?.data ?? []) {
      map.set(p.id, `${p.apellido}, ${p.nombre}`.trim());
    }
    return map;
  }, [personasQ.data]);

  const prestamos = useMemo(() => prestamosQ.data?.data ?? [], [prestamosQ.data]);

  // KPIs de cartera: total, en mora, al día (montos sumados en centavos).
  const resumen = useMemo(() => {
    let total = "0.00";
    let mora = "0.00";
    let alDia = "0.00";
    let moraCount = 0;
    let alDiaCount = 0;
    for (const p of prestamos) {
      const m = montoPrestamo(p) ?? "0.00";
      total = addMoney(total, m);
      if (esMora(p.estado)) {
        mora = addMoney(mora, m);
        moraCount += 1;
      } else if (esAlDia(p.estado)) {
        alDia = addMoney(alDia, m);
        alDiaCount += 1;
      }
    }
    return { total, mora, alDia, moraCount, alDiaCount };
  }, [prestamos]);

  const opcionesEstado = useMemo<OpcionEstado[]>(() => {
    const vistos = new Set<string>();
    for (const p of prestamos) if (p.estado) vistos.add(p.estado);
    return [...vistos].sort().map((e) => ({ value: e, label: ESTADO_LABEL[e] ?? e }));
  }, [prestamos]);

  const filtrados = useMemo(() => {
    const porCriterios = filtrarCartera(prestamos, ACC_PRESTAMO, filtro);
    const q = busqueda.trim().toLowerCase();
    if (!q) return porCriterios;
    return porCriterios.filter((p) => {
      const nombre = nombrePorPersona.get(p.persona_id) ?? "";
      return nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    });
  }, [prestamos, filtro, busqueda, nombrePorPersona]);

  if (prestamosQ.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudieron cargar tus créditos.
      </p>
    );
  }

  const hayFiltro = busqueda.trim() !== "" || filtrados.length !== prestamos.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">Mis créditos</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          <span style={MONO}>{prestamos.length}</span>{" "}
          {prestamos.length === 1 ? "préstamo" : "préstamos"} en tu cartera
        </p>
      </div>

      {/* KPI hero: cartera total domina, mora y al día como satélites. */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <KpiCartera
          label="Cartera total"
          value={resumen.total}
          count={prestamos.length}
          intent="brand"
          big
        />
        <KpiCartera label="En mora" value={resumen.mora} count={resumen.moraCount} intent="neg" />
        <KpiCartera label="Al día" value={resumen.alDia} count={resumen.alDiaCount} intent="pos" />
      </section>

      <div className="space-y-3">
        <Input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por cliente…"
          aria-label="Buscar créditos por cliente"
          className="max-w-sm"
        />
        <CarteraFilter
          filtro={filtro}
          onChange={setFiltro}
          estados={opcionesEstado}
          labelMonto="Monto"
        />
        {!prestamosQ.isLoading && (
          <p className="text-xs text-text-subtle">
            Mostrando <span style={MONO}>{filtrados.length}</span> de{" "}
            <span style={MONO}>{prestamos.length}</span>
          </p>
        )}
      </div>

      {prestamosQ.isLoading ? (
        <CreditosSkeleton />
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface px-4 py-14 text-center">
          <p className="text-sm font-medium text-text">
            {hayFiltro ? "Sin coincidencias" : "Sin créditos todavía"}
          </p>
          <p className="text-xs text-text-subtle">
            {hayFiltro
              ? "Ningún crédito coincide con los filtros."
              : "Cuando se desembolsen tus solicitudes aprobadas, vas a verlas acá."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtrados.map((p) => (
            <CreditoCard
              key={p.id}
              prestamo={p}
              nombre={nombrePorPersona.get(p.persona_id) ?? `Cliente ${idCorto(p.persona_id)}`}
              onAbrirCliente={() => navigate({ to: `/personas/${p.persona_id}` as string })}
              onAbrirCredito={() => navigate({ to: `/prestamos/${p.id}` as string })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function KpiCartera({
  label,
  value,
  count,
  intent,
  big = false,
}: {
  label: string;
  value: string;
  count: number;
  intent: "brand" | "neg" | "pos";
  big?: boolean;
}) {
  const strip = intent === "neg" ? "bg-neg" : intent === "pos" ? "bg-pos" : "bg-brand";
  const moneyIntent = intent === "neg" ? "expense" : intent === "pos" ? "income" : "neutral";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div aria-hidden className={`absolute inset-x-0 top-0 h-1 ${strip}`} />
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
        <span className="text-xs text-text-subtle" style={MONO}>
          {count}
        </span>
      </div>
      <div className={`mt-1.5 font-bold leading-none ${big ? "text-3xl" : "text-2xl"}`}>
        <MoneyText value={value} intent={moneyIntent} />
      </div>
    </div>
  );
}

function CreditoCard({
  prestamo,
  nombre,
  onAbrirCliente,
  onAbrirCredito,
}: {
  prestamo: Prestamo;
  nombre: string;
  onAbrirCliente: () => void;
  onAbrirCredito: () => void;
}) {
  const tono = ESTADO_TONO[prestamo.estado] ?? "default";
  const dot = riskDot(prestamo.estado);
  const mora = esMora(prestamo.estado);
  return (
    <li
      className={[
        "relative overflow-hidden rounded-xl border bg-surface shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
        mora ? "border-neg-border" : "border-border",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-4 p-4">
        {/* Punto de riesgo. */}
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${DOT_BG[dot]}`} />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onAbrirCliente}
            className="truncate text-sm font-medium text-text transition-colors hover:text-brand hover:underline"
          >
            {nombre}
          </button>
          <p className="mt-0.5 text-xs text-text-subtle">
            {prestamo.fecha_desembolso ? (
              <>
                Desembolsado el <span style={MONO}>{prestamo.fecha_desembolso}</span>
              </>
            ) : (
              "Sin desembolsar"
            )}
          </p>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold leading-none">
            <MoneyText
              value={prestamo.monto_desembolsado ?? prestamo.capital}
              intent={mora ? "expense" : "neutral"}
            />
          </div>
          <div className="mt-1.5">
            <Badge tone={tono}>{ESTADO_LABEL[prestamo.estado] ?? prestamo.estado}</Badge>
          </div>
        </div>

        <button
          type="button"
          onClick={onAbrirCredito}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-sunken"
        >
          Ver estado de cuenta
        </button>
      </div>
    </li>
  );
}

function CreditosSkeleton() {
  return (
    <ul className="space-y-2.5" aria-busy="true">
      <li className="h-20 animate-pulse rounded-xl border border-border bg-surface-sunken" />
      <li className="h-20 animate-pulse rounded-xl border border-border bg-surface-sunken" />
      <li className="h-20 animate-pulse rounded-xl border border-border bg-surface-sunken" />
    </ul>
  );
}
