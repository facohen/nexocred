import { useState } from "react";
import { useProductos } from "@/lib/api/queries";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";

export function ProductosPage() {
  const { data, isLoading, isError } = useProductos();
  const [selected, setSelected] = useState<string | null>(null);
  const productos = data?.data ?? [];
  const detalle = productos.find((p) => p.id === selected) ?? productos[0];

  if (isLoading) return <div className="animate-pulse text-foreground/40">Cargando catálogo…</div>;
  if (isError)
    return (
      <div role="alert" className="text-red-700">
        No se pudo cargar el catálogo.
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Catálogo de productos</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 space-y-2">
          {productos.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className="block w-full rounded-lg border border-border bg-white p-3 text-left hover:bg-muted"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.nombre}</span>
                <Badge tone={p.estado === "publicado" ? "success" : "warning"}>{p.estado}</Badge>
              </div>
              <span className="text-xs text-foreground/50">v{p.version_vigente}</span>
            </button>
          ))}
        </div>
        <div className="col-span-2">
          {detalle && (
            <Card>
              <CardTitle>{detalle.nombre}</CardTitle>
              <p className="mb-3 text-sm text-foreground/70">{detalle.descripcion}</p>
              <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-foreground/50">Periodicidad</dt>
                  <dd>{detalle.periodicidad ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground/50">Plazos</dt>
                  <dd>{(detalle.plazos_permitidos ?? []).join(", ")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground/50">Monto mínimo</dt>
                  <dd>
                    <MoneyText value={detalle.monto_minimo ?? null} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground/50">Monto máximo</dt>
                  <dd>
                    <MoneyText value={detalle.monto_maximo ?? null} />
                  </dd>
                </div>
              </dl>
              <h4 className="mb-1 text-sm font-medium">Gastos</h4>
              <table className="w-full text-sm">
                <tbody>
                  {(detalle.gastos ?? []).map((g, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1">{g.nombre}</td>
                      <td className="py-1 text-foreground/60">{g.tipo}</td>
                      <td className="py-1 text-right">
                        {g.tipo === "porcentaje" ? `${g.valor}%` : <MoneyText value={g.valor} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
