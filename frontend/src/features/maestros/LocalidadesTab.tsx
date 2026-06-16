import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useProvincias, useLocalidades, useCrearLocalidad } from "./hooks";

export function LocalidadesTab() {
  const { data: provData, isLoading: provLoading } = useProvincias();
  const [provinciaId, setProvinciaId] = useState<string>("");
  const { data: locData, isLoading: locLoading } = useLocalidades(provinciaId || undefined);
  const crear = useCrearLocalidad();

  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");

  const provincias = provData?.data ?? [];
  const localidades = locData?.data ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!provinciaId) return;
    crear.mutate(
      { provincia_id: provinciaId, nombre: nombre.trim() },
      { onSuccess: () => { setNombre(""); setShowForm(false); } },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Localidades</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Localidades por provincia. Seleccioná una provincia para ver y agregar localidades.
          </p>
        </div>
        <Button size="sm" disabled={!provinciaId} onClick={() => setShowForm(true)}>
          + Nueva
        </Button>
      </div>

      <div>
        <label htmlFor="provincia-select" className="mb-1 block text-sm font-medium text-text">
          Provincia
        </label>
        <select
          id="provincia-select"
          value={provinciaId}
          onChange={(e) => setProvinciaId(e.target.value)}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
        >
          <option value="">Seleccionar provincia…</option>
          {provLoading ? (
            <option disabled>Cargando…</option>
          ) : (
            provincias.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))
          )}
        </select>
      </div>

      {provinciaId && (
        locLoading ? (
          <div className="animate-pulse rounded-lg border border-border bg-surface p-6 text-center text-text-subtle">
            Cargando localidades…
          </div>
        ) : localidades.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-subtle">
            Sin localidades para esta provincia todavía.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">Localidades</caption>
              <thead>
                <tr className="border-b border-border bg-surface-sunken text-left text-text-muted">
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Código</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {localidades.map((loc) => (
                  <tr key={loc.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2 text-text">{loc.nombre}</td>
                    <td className="px-4 py-2 text-text-muted">{loc.codigo ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge tone={loc.activo ? "default" : "info"}>
                        {loc.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Dialog open={showForm} onOpenChange={setShowForm} title="Nueva localidad">
        <div className="space-y-4 p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="loc-nombre" className="mb-1 block text-sm font-medium text-text">
                Nombre
              </label>
              <input
                id="loc-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                placeholder="ej: Palermo"
                className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={crear.isPending}>
                Guardar
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
