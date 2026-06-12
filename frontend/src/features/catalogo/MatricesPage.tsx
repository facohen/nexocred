import { useMemo } from "react";
import { useMatrizTasas } from "@/lib/api/queries";
import { Card, CardTitle } from "@/components/ui/card";

export function MatricesPage() {
  const { data, isLoading, isError } = useMatrizTasas();
  const filas = data?.data ?? [];

  const { perfiles, plazos, lookup } = useMemo(() => {
    const perfilesSet = new Set<string>();
    const plazosSet = new Set<number>();
    const map = new Map<string, string>();
    for (const f of filas) {
      perfilesSet.add(f.perfil_pricing_id);
      plazosSet.add(f.plazo);
      map.set(`${f.perfil_pricing_id}|${f.plazo}`, f.tasa);
    }
    return {
      perfiles: [...perfilesSet],
      plazos: [...plazosSet].sort((a, b) => a - b),
      lookup: map,
    };
  }, [filas]);

  if (isLoading) return <div className="animate-pulse text-foreground/40">Cargando matriz…</div>;
  if (isError)
    return (
      <div role="alert" className="text-red-700">
        No se pudo cargar la matriz de tasas.
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Matriz de tasas (producto × perfil × plazo)</h1>
      <Card>
        <CardTitle>Tasa de interés directo (%)</CardTitle>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-foreground/60">
              <th className="py-1">Perfil \ Plazo</th>
              {plazos.map((p) => (
                <th key={p} className="py-1 text-right">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perfiles.map((perfil) => (
              <tr key={perfil} className="border-t border-border">
                <td className="py-1 font-medium">{perfil}</td>
                {plazos.map((plazo) => (
                  <td key={plazo} className="py-1 text-right tabular-nums">
                    {/* Tasa is a string — rendered verbatim, never Number()d. */}
                    {lookup.get(`${perfil}|${plazo}`) ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
