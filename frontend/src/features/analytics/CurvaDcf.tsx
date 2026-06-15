import {
  Area,
  AreaChart,
  CartesianGrid,
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
import type { components } from "@/lib/api/schema";

type DCFPuntoCurva = components["schemas"]["DCFPuntoCurva"];

/**
 * Curva de valor presente acumulado por mes (escenario base): muestra cuánto del
 * valor de la cartera se materializa a corto/mediano/largo plazo. La conversión a
 * número es SOLO geométrica (posición); los montos se muestran formateados desde
 * el string original.
 */
export function CurvaDcf({ curva }: { curva: DCFPuntoCurva[] }) {
  if (!curva.length) {
    return <p className="text-sm text-text-subtle">Sin flujos futuros para proyectar.</p>;
  }
  const data = curva.map((p) => ({
    mes: p.mes,
    vp: Number(p.vp_acumulado) || 0,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id="vpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="mes"
            tick={AXIS_TICK}
            stroke={AXIS_STROKE}
            tickFormatter={(m: number) => `${m}m`}
          />
          <YAxis tick={AXIS_TICK} stroke={AXIS_STROKE} tickFormatter={moneyTickFormatter} width={90} />
          <Tooltip
            labelFormatter={(m) => `Mes ${m}`}
            formatter={moneyTickFormatter}
            contentStyle={TOOLTIP_STYLE}
          />
          <Area
            type="monotone"
            dataKey="vp"
            stroke="hsl(var(--brand))"
            strokeWidth={2}
            fill="url(#vpFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
