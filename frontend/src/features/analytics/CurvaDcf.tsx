import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_STROKE,
  AXIS_TICK,
  GRID_PROPS,
  TOOLTIP_STYLE,
  moneyTickFormatter,
} from "./recharts-config";
import { MoneyText } from "@/components/MoneyText";
import type { components } from "@/lib/api/schema";

type DCFPuntoCurva = components["schemas"]["DCFPuntoCurva"];

/**
 * Curva de valor presente acumulado por mes (escenario base): muestra cuánto del
 * valor de la cartera se materializa a corto/mediano/largo plazo. La conversión a
 * número es SOLO geométrica (posición); los montos se muestran formateados desde
 * el string original.
 */
export function CurvaDcf({ curva }: { curva: DCFPuntoCurva[] }) {
  const data = useMemo(
    () =>
      curva.map((p) => ({
        mes: p.mes,
        vp: Number(p.vp_acumulado) || 0,
      })),
    [curva],
  );

  if (!curva.length) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-sunken text-center">
        <span className="text-sm font-medium text-text-muted">
          Sin flujos futuros para proyectar.
        </span>
        <span className="text-xs text-text-subtle">
          La curva aparece cuando hay cuotas pendientes en la cartera.
        </span>
      </div>
    );
  }

  // Geometría únicamente: total acumulado y mes en que se cruza la "media vida"
  // del valor (50 % del VP materializado). No es display de dinero.
  const total = data.length ? data[data.length - 1].vp : 0;
  const ultimo = curva[curva.length - 1];
  const mediaVida = total > 0 ? data.find((d) => d.vp >= total / 2)?.mes : undefined;

  return (
    <figure className="space-y-3">
      <figcaption className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-2 text-xs">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: "hsl(var(--brand))" }}
            aria-hidden
          />
          <span className="font-medium uppercase tracking-widest text-text-muted">
            VP acumulado · base
          </span>
        </div>
        {mediaVida != null && (
          <span className="flex items-center gap-1.5 text-xs text-text-subtle">
            <span
              className="h-px w-4"
              style={{
                borderTop: "1px dashed hsl(var(--warn) / 0.7)",
              }}
              aria-hidden
            />
            50 % del valor al mes{" "}
            <span
              className="font-num font-semibold text-warn"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              {mediaVida}
            </span>
          </span>
        )}
      </figcaption>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="vpFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.28} />
                <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="mes"
              tick={{ ...AXIS_TICK, fontFamily: "'Geist Mono', monospace" }}
              stroke={AXIS_STROKE}
              tickLine={false}
              tickFormatter={(m: number) => `${m}m`}
              label={{
                value: "Horizonte (meses)",
                position: "insideBottom",
                offset: -2,
                fontSize: 10,
                fill: "hsl(var(--text-subtle))",
              }}
            />
            <YAxis
              tick={{ ...AXIS_TICK, fontFamily: "'Geist Mono', monospace" }}
              stroke={AXIS_STROKE}
              tickLine={false}
              tickFormatter={moneyTickFormatter}
              width={92}
            />
            {mediaVida != null && (
              <ReferenceLine
                x={mediaVida}
                stroke="hsl(var(--warn))"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
              />
            )}
            <Tooltip
              labelFormatter={(m) => `Mes ${m}`}
              formatter={moneyTickFormatter}
              cursor={{ stroke: "hsl(var(--brand))", strokeOpacity: 0.3, strokeWidth: 1 }}
              contentStyle={TOOLTIP_STYLE}
            />
            <Area
              type="monotone"
              dataKey="vp"
              stroke="hsl(var(--brand))"
              strokeWidth={2}
              fill="url(#vpFill)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "hsl(var(--brand))",
                stroke: "hsl(var(--surface))",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs uppercase tracking-widest text-text-subtle">
          VP total al mes {ultimo.mes}
        </span>
        <MoneyText value={ultimo.vp_acumulado} className="text-sm font-semibold" align="right" />
      </div>
    </figure>
  );
}
