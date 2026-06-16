import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useVendedores, useAsignarVendedor, useZonas, useSectores } from "./hooks";

export function VendedoresTab() {
  const { data: vendedores, isLoading, isError } = useVendedores();
  const { data: zonasData } = useZonas();
  const { data: sectoresData } = useSectores();
  const asignar = useAsignarVendedor();

  const [asignando, setAsignando] = useState<string | null>(null);
  const [zonaId, setZonaId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [vigenteSince, setVigenteSince] = useState(() => new Date().toISOString().slice(0, 10));

  const zonas = zonasData?.data ?? [];
  const sectores = sectoresData?.data ?? [];
  const lista = vendedores ?? [];

  const handleAsignar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!asignando) return;
    asignar.mutate(
      { vendedorId: asignando, zona_id: zonaId, sector_id: sectorId, vigente_desde: vigenteSince },
      {
        onSuccess: () => {
          setAsignando(null);
          setZonaId("");
          setSectorId("");
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text">Vendedores</h2>
        <p className="mt-0.5 text-sm text-text-muted">
          Vista de usuarios con rol vendedor y su asignación vigente de zona/sector.
        </p>
      </div>

      {isLoading ? (
        <div className="animate-pulse rounded-lg border border-border bg-surface p-8 text-center text-text-subtle">
          Cargando…
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-neg-border bg-neg-bg p-4 text-center text-neg">
          Error al cargar vendedores.
        </div>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-subtle">
          No hay vendedores activos.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Vendedores y asignaciones</caption>
            <thead>
              <tr className="border-b border-border bg-surface-sunken text-left text-text-muted">
                <th className="px-4 py-2 font-medium">Vendedor</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Zona</th>
                <th className="px-4 py-2 font-medium">Sector</th>
                <th className="px-4 py-2 font-medium">Desde</th>
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => {
                const asig = v.asignacion_vigente;
                const zonaNombre = asig
                  ? (zonas.find((z) => z.id === asig.zona_id)?.nombre ?? asig.zona_id.slice(0, 8))
                  : null;
                const sectorNombre = asig
                  ? (sectores.find((s) => s.id === asig.sector_id)?.nombre ?? asig.sector_id.slice(0, 8))
                  : null;
                return (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2 font-medium text-text">{v.nombre}</td>
                    <td className="px-4 py-2 text-text-muted">{v.email}</td>
                    <td className="px-4 py-2 text-text">
                      {zonaNombre ?? <span className="text-text-subtle">Sin asignar</span>}
                    </td>
                    <td className="px-4 py-2 text-text">
                      {sectorNombre ?? <span className="text-text-subtle">—</span>}
                    </td>
                    <td className="px-4 py-2 text-text-muted">{asig?.vigente_desde ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAsignando(v.id);
                          setZonaId(asig?.zona_id ?? "");
                          setSectorId(asig?.sector_id ?? "");
                        }}
                      >
                        {asig ? "Reasignar" : "Asignar"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!asignando} onOpenChange={(o) => { if (!o) setAsignando(null); }} title="Asignar zona / sector">
        <div className="space-y-4 p-4">
          <form onSubmit={handleAsignar} className="space-y-3">
            <div>
              <label htmlFor="vend-zona" className="mb-1 block text-sm font-medium text-text">
                Zona
              </label>
              <select
                id="vend-zona"
                value={zonaId}
                onChange={(e) => setZonaId(e.target.value)}
                required
                className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
              >
                <option value="">Seleccionar…</option>
                {zonas.filter((z) => z.activo).map((z) => (
                  <option key={z.id} value={z.id}>{z.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vend-sector" className="mb-1 block text-sm font-medium text-text">
                Sector
              </label>
              <select
                id="vend-sector"
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                required
                className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
              >
                <option value="">Seleccionar…</option>
                {sectores.filter((s) => s.activo).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vend-desde" className="mb-1 block text-sm font-medium text-text">
                Vigente desde
              </label>
              <input
                id="vend-desde"
                type="date"
                value={vigenteSince}
                onChange={(e) => setVigenteSince(e.target.value)}
                required
                className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAsignando(null)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={asignar.isPending}>
                Guardar
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
