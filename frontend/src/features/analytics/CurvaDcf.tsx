import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoneyAr } from "@/lib/money";
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
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--text-muted))"
            tickFormatter={(m: number) => `${m}m`}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--text-muted))"
            tickFormatter={(v: number) => formatMoneyAr(String(v))}
            width={90}
          />
          <Tooltip
            labelFormatter={(m) => `Mes ${m}`}
            formatter={(v) => formatMoneyAr(String(v ?? 0))}
            contentStyle={{
              background: "hsl(var(--surface))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
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
