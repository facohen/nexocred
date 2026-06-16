import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePrestamos, usePersonas } from "@/lib/api/queries";
import { getToken, decodeUserIdFromToken } from "@/lib/auth";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/MoneyText";
import { WorkInboxHero } from "@/components/WorkInbox";
import type { components } from "@/lib/api/schema";

type Prestamo = components["schemas"]["PrestamoOut"];

// Estados de préstamo → tono del badge. El backend usa strings libres; mapeamos
// los conocidos y caemos a "default" para el resto (sin romper si aparece uno nuevo).
const ESTADO_TONO: Record<string, BadgeTone> = {
  vigente: "success",
  al_dia: "success",
  pagado: "default",
  cancelado: "default",
  en_mora: "danger",
  refinanciado: "info",
};

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

  const nombrePorPersona = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of personasQ.data?.data ?? []) {
      map.set(p.id, `${p.apellido}, ${p.nombre}`.trim());
    }
    return map;
  }, [personasQ.data]);

  const prestamos = useMemo(() => prestamosQ.data?.data ?? [], [prestamosQ.data]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return prestamos;
    return prestamos.filter((p) => {
      const nombre = nombrePorPersona.get(p.persona_id) ?? "";
      return nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    });
  }, [prestamos, busqueda, nombrePorPersona]);

  if (prestamosQ.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudieron cargar tus créditos.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Mis créditos"
        subtitle={`${prestamos.length} ${prestamos.length === 1 ? "préstamo" : "préstamos"} en tu cartera`}
      />

      <Input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por cliente…"
        aria-label="Buscar créditos por cliente"
        className="max-w-sm"
      />

      {prestamosQ.isLoading ? (
        <p className="animate-pulse text-sm text-text-subtle">Cargando créditos…</p>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardTitle>{busqueda ? "Sin coincidencias" : "Sin créditos todavía"}</CardTitle>
          <p className="text-sm text-text-subtle">
            {busqueda
              ? "Ningún crédito coincide con la búsqueda."
              : "Cuando se desembolsen tus solicitudes aprobadas, vas a verlas acá."}
          </p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {filtrados.map((p) => (
              <CreditoFila
                key={p.id}
                prestamo={p}
                nombre={nombrePorPersona.get(p.persona_id) ?? `Cliente ${idCorto(p.persona_id)}`}
                onAbrirCliente={() => navigate({ to: `/personas/${p.persona_id}` as string })}
                onAbrirCredito={() => navigate({ to: `/prestamos/${p.id}` as string })}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CreditoFila({
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
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={onAbrirCliente}
          className="text-sm font-medium text-text hover:text-brand hover:underline"
        >
          {nombre}
        </button>
        <div className="flex items-center gap-2">
          <MoneyText
            value={prestamo.monto_desembolsado ?? prestamo.capital}
            className="font-semibold"
          />
          <Badge tone={tono}>{prestamo.estado}</Badge>
        </div>
        <p className="text-xs text-text-subtle">
          {prestamo.fecha_desembolso
            ? `Desembolsado el ${prestamo.fecha_desembolso}`
            : "Sin desembolsar"}
        </p>
      </div>
      <button
        type="button"
        onClick={onAbrirCredito}
        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-sunken"
      >
        Ver estado de cuenta
      </button>
    </li>
  );
}
