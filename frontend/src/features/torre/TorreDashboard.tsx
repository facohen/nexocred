import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import { formatPercent } from "@/features/riesgo/format";
import {
  useResumen,
  usePulso,
  useSaludCartera,
  useOperacionHoy,
  useNegocio,
  useAlertasLive,
} from "./hooks";

const CLAVES_MONEY = new Set(["cartera", "cobranza_hoy", "colocacion_mes"]);
const CLAVES_PORCENTAJE = new Set(["par30", "par60", "par90"]);

/** Tramos de aging mapeados a la escala de mora ordinal (color con propósito). */
const AGING_TRAMOS: { key: string; label: string; bar: string; text: string }[] = [
  { key: "0", label: "Al día", bar: "bg-risk-0", text: "text-risk-0" },
  { key: "1-30", label: "PAR30", bar: "bg-risk-30", text: "text-risk-30" },
  { key: "31-60", label: "PAR60", bar: "bg-risk-60", text: "text-risk-60" },
  { key: "61-90", label: "PAR90", bar: "bg-risk-90", text: "text-risk-90" },
  { key: "90+", label: "Castigo", bar: "bg-risk-castigo", text: "text-risk-castigo" },
];

function KpiValor({ clave, valor }: { clave: string; valor: string }) {
  if (CLAVES_MONEY.has(clave))
    return <MoneyText value={valor} className="text-2xl font-semibold" />;
  if (CLAVES_PORCENTAJE.has(clave))
    return <span className="font-num text-2xl font-semibold">{formatPercent(valor)}</span>;
  return <span className="font-num text-2xl font-semibold">{valor.replace(".", ",")}</span>;
}

/**
 * Tablero Ejecutivo — dashboard de dirección. KPIs con drill-down a la cola que
 * los origina; aging con escala de mora ordinal; operación del día y negocio.
 * Cada métrica es un índice accionable, no un número muerto.
 */
export function TorreDashboard() {
  const resumenQ = useResumen();
  const pulsoQ = usePulso();
  const saludQ = useSaludCartera();
  const opQ = useOperacionHoy();
  const negocioQ = useNegocio();
  const alertasQ = useAlertasLive();

  if (resumenQ.isLoading || pulsoQ.isLoading) {
    return (
      <div data-testid="torre-loading" className="space-y-2 p-4">
        <div className="h-6 w-1/3 animate-pulse rounded bg-surface-sunken" />
        <div className="h-24 w-full animate-pulse rounded bg-surface-sunken" />
      </div>
    );
  }
  if (resumenQ.isError || pulsoQ.isError) {
    return (
      <div role="alert" className="m-4 rounded-lg border border-neg-border bg-neg-bg p-3 text-sm text-neg">
        No se pudo cargar el Tablero Ejecutivo.
      </div>
    );
  }

  const resumen = resumenQ.data!;
  const pulso = pulsoQ.data!;

  if (!resumen.tiene_snapshot || !pulso.tiene_snapshot) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-text">Tablero Ejecutivo</h1>
        <div className="rounded-lg border border-dashed border-border bg-surface-sunken p-8 text-center text-sm text-text-muted">
          Aún no hay snapshot de cartera. Ejecutá el job de snapshot (o esperá la
          corrida nocturna) para ver los indicadores.
        </div>
      </div>
    );
  }

  const salud = saludQ.data;
  const op = opQ.data;
  const negocio = negocioQ.data;
  const alertas = alertasQ.data?.alertas ?? [];

  return (
    <div className="space-y-6">
      {/* Encabezado con Índice de Salud */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Tablero Ejecutivo</h1>
          {resumen.periodo && (
            <p className="text-sm text-text-muted">Período: {resumen.periodo}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-text-subtle">Índice de Salud</div>
          <div data-testid="indice-nexo" className="font-num text-3xl font-bold text-text">
            {resumen.indice_nexo.replace(".", ",")}
          </div>
        </div>
      </div>

      {/* Franja de KPIs (Indicadores Clave) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {pulso.tarjetas.map((t) => (
          <a
            key={t.clave}
            data-testid="pulso-card"
            href={CLAVES_PORCENTAJE.has(t.clave) ? "/riesgo/tablero" : "/prestamos"}
            className="block"
          >
            <Card className="transition-colors hover:bg-surface-sunken">
              <div className="text-xs text-text-muted">{t.etiqueta}</div>
              <KpiValor clave={t.clave} valor={t.valor} />
            </Card>
          </a>
        ))}
      </div>

      {/* Salud de cartera: aging con escala de mora ordinal */}
      {salud?.aging && (
        <Card>
          <CardTitle>Salud de cartera · aging</CardTitle>
          <div className="space-y-2">
            {AGING_TRAMOS.map((tramo) => {
              const valor = (salud.aging as Record<string, string>)[tramo.key] ?? "0.00";
              return (
                <div key={tramo.key} className="flex items-center gap-3 text-sm">
                  <span className={`flex w-20 items-center gap-1.5 ${tramo.text}`}>
                    <span className={`h-2 w-2 rounded-full ${tramo.bar}`} />
                    {tramo.label}
                  </span>
                  <div className="flex-1">
                    <a href="/riesgo/tablero" className="hover:underline">
                      <MoneyText value={valor} className="text-text" />
                    </a>
                  </div>
                </div>
              );
            })}
            {salud.perdida_esperada && (
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-text-muted">Pérdida esperada</span>
                <MoneyText value={salud.perdida_esperada} intent="expense" className="font-semibold" />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Operación del día + Negocio del mes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Operación de hoy</CardTitle>
          {op ? (
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between">
                <a href="/ruta" className="text-text-muted hover:text-text hover:underline">Cobranza del día</a>
                <MoneyText value={op.cobranza_del_dia} intent="income" />
              </li>
              <li className="flex justify-between">
                <span className="text-text-muted">Cuotas vencen hoy</span>
                <span className="font-num">{op.cuotas_vencen_hoy}</span>
              </li>
              <li className="flex justify-between">
                <a href="/ruta" className="text-text-muted hover:text-text hover:underline">Rutas activas</a>
                <span className="font-num">{op.rutas_activas}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-text-muted">Promesas pendientes</span>
                <span className="font-num">{op.promesas_pendientes}</span>
              </li>
              <li className="flex justify-between">
                <a href="/solicitudes" className="text-text-muted hover:text-text hover:underline">Pipeline solicitudes</a>
                <span className="font-num">{op.pipeline_solicitudes}</span>
              </li>
            </ul>
          ) : (
            <p className="text-sm text-text-muted">Sin datos.</p>
          )}
        </Card>

        <Card>
          <CardTitle>Negocio del mes</CardTitle>
          {negocio ? (
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between">
                <span className="text-text-muted">Colocación</span>
                <MoneyText value={negocio.colocacion_mes} />
              </li>
              <li className="flex justify-between">
                <span className="text-text-muted">Intereses cobrados</span>
                <MoneyText value={negocio.intereses_cobrados_mes} intent="income" />
              </li>
              <li className="flex justify-between">
                <span className="text-text-muted">Punitorios cobrados</span>
                <MoneyText value={negocio.punitorios_cobrados_mes} intent="income" />
              </li>
            </ul>
          ) : (
            <p className="text-sm text-text-muted">Sin datos.</p>
          )}
        </Card>
      </div>

      {/* Alertas Activas con drill-down */}
      <Card>
        <CardTitle>Alertas Activas</CardTitle>
        {alertas.length === 0 ? (
          <p className="text-sm text-text-muted">Sin alertas activas.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {alertas.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <a
                  href={`/prestamos/${a.prestamo_id}`}
                  className="text-brand underline-offset-2 hover:underline"
                >
                  {a.tipo}
                </a>
                <span className="flex items-center gap-2">
                  {a.severidad && (
                    <Badge tone={a.severidad === "alta" ? "danger" : "warning"}>{a.severidad}</Badge>
                  )}
                  <span className="font-num text-text-muted">
                    {a.metrica}: {a.valor}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
