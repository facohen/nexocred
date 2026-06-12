import { Card } from "@/components/ui/card";
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

// Claves de pulso cuyo valor es plata (se renderiza con MoneyText); el resto
// (índices/porcentajes) se muestra como ratio.
const CLAVES_MONEY = new Set(["cartera", "cobranza_hoy", "colocacion_mes"]);
const CLAVES_PORCENTAJE = new Set(["par30", "par60", "par90"]);

function ValorTarjeta({ clave, valor }: { clave: string; valor: string }) {
  if (CLAVES_MONEY.has(clave)) return <MoneyText value={valor} className="text-lg font-semibold" />;
  if (CLAVES_PORCENTAJE.has(clave)) return <span className="text-lg font-semibold tabular-nums">{formatPercent(valor)}</span>;
  return <span className="text-lg font-semibold tabular-nums">{valor.replace(".", ",")}</span>;
}

/**
 * La Torre — dashboard ejecutivo. Render 100% desde los mocks snapshot-backed
 * (resumen/pulso/salud/operación/negocio/alertas-live). Si no hay snapshot
 * (endpoints en cero) se muestra el estado vacío. Money siempre string.
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
        <div className="h-6 w-1/3 animate-pulse rounded bg-foreground/10" />
        <div className="h-24 w-full animate-pulse rounded bg-foreground/10" />
      </div>
    );
  }
  if (resumenQ.isError || pulsoQ.isError) {
    return (
      <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        No se pudo cargar La Torre.
      </div>
    );
  }

  const resumen = resumenQ.data!;
  const pulso = pulsoQ.data!;

  // Estado vacío: La Torre depende del snapshot_cartera; sin él no hay datos.
  // Si CUALQUIERA de las secciones reporta que no hay snapshot (OR), tratamos
  // el dashboard como sin snapshot: un snapshot parcial/inconsistente muestra
  // el estado vacío unificado en lugar de tarjetas a medias.
  if (!resumen.tiene_snapshot || !pulso.tiene_snapshot) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">La Torre</h1>
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-foreground/60">
          Aún no hay snapshot de cartera. Ejecutá el job de snapshot (o esperá la
          corrida nocturna) para ver los indicadores.
        </div>
      </div>
    );
  }

  const op = opQ.data;
  const negocio = negocioQ.data;
  const alertas = alertasQ.data?.alertas ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">La Torre</h1>
        <div className="text-right">
          <div className="text-xs text-foreground/60">Índice Nexo</div>
          <div data-testid="indice-nexo" className="text-2xl font-bold tabular-nums">
            {resumen.indice_nexo.replace(".", ",")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {pulso.tarjetas.map((t) => (
          <div key={t.clave} data-testid="pulso-card">
            <Card>
              <div className="text-xs text-foreground/60">{t.etiqueta}</div>
              <ValorTarjeta clave={t.clave} valor={t.valor} />
            </Card>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground/80">Operación de hoy</h3>
          {op ? (
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between"><span>Cobranza del día</span><MoneyText value={op.cobranza_del_dia} /></li>
              <li className="flex justify-between"><span>Cuotas vencen hoy</span><span className="tabular-nums">{op.cuotas_vencen_hoy}</span></li>
              <li className="flex justify-between"><span>Rutas activas</span><span className="tabular-nums">{op.rutas_activas}</span></li>
              <li className="flex justify-between"><span>Promesas pendientes</span><span className="tabular-nums">{op.promesas_pendientes}</span></li>
              <li className="flex justify-between"><span>Pipeline solicitudes</span><span className="tabular-nums">{op.pipeline_solicitudes}</span></li>
            </ul>
          ) : (
            <p className="text-sm text-foreground/60">Sin datos.</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground/80">Negocio del mes</h3>
          {negocio ? (
            <ul className="space-y-1 text-sm">
              <li className="flex justify-between"><span>Colocación</span><MoneyText value={negocio.colocacion_mes} /></li>
              <li className="flex justify-between"><span>Intereses cobrados</span><MoneyText value={negocio.intereses_cobrados_mes} /></li>
              <li className="flex justify-between"><span>Punitorios cobrados</span><MoneyText value={negocio.punitorios_cobrados_mes} /></li>
            </ul>
          ) : (
            <p className="text-sm text-foreground/60">Sin datos.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground/80">
          Alertas en vivo {saludQ.data ? "" : ""}
        </h3>
        {alertas.length === 0 ? (
          <p className="text-sm text-foreground/60">Sin alertas activas.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {alertas.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <a
                  href={`/prestamos/${a.prestamo_id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {a.tipo}
                </a>
                <span className="flex items-center gap-2">
                  {a.severidad && <Badge tone={a.severidad === "alta" ? "danger" : "warning"}>{a.severidad}</Badge>}
                  <span className="tabular-nums text-foreground/60">{a.metrica}: {a.valor}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
