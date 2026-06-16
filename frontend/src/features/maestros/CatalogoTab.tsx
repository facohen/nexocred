import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { CatalogoOut } from "./hooks";

interface Column<T> {
  key: keyof T;
  label: string;
  render?: (v: T[keyof T], row: T) => React.ReactNode;
}

interface CatalogoTabProps<T extends CatalogoOut> {
  titulo: string;
  descripcion: string;
  items: T[];
  isLoading: boolean;
  isError: boolean;
  columns?: Column<T>[];
  onCreate: (datos: { codigo: string; nombre: string }) => void;
  onToggle: (item: T) => void;
  isCreating?: boolean;
}

export function CatalogoTab<T extends CatalogoOut>({
  titulo,
  descripcion,
  items,
  isLoading,
  isError,
  columns,
  onCreate,
  onToggle,
  isCreating,
}: CatalogoTabProps<T>) {
  const [showForm, setShowForm] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ codigo: codigo.trim(), nombre: nombre.trim() });
    setCodigo("");
    setNombre("");
    setShowForm(false);
  };

  const defaultColumns: Column<CatalogoOut>[] = [
    { key: "codigo", label: "Código" },
    { key: "nombre", label: "Nombre" },
    { key: "orden", label: "Orden" },
    {
      key: "activo",
      label: "Estado",
      render: (v) => (
        <Badge tone={v ? "default" : "info"}>{v ? "Activo" : "Inactivo"}</Badge>
      ),
    },
  ];

  const cols = (columns ?? defaultColumns) as Column<T>[];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">{titulo}</h2>
          <p className="mt-0.5 text-sm text-text-muted">{descripcion}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          + Nuevo
        </Button>
      </div>

      {isLoading ? (
        <div className="animate-pulse rounded-lg border border-border bg-surface p-8 text-center text-text-subtle">
          Cargando…
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-neg-border bg-neg-bg p-4 text-center text-neg">
          Error al cargar datos.
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-subtle">
          Todavía no hay registros.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">{titulo}</caption>
            <thead>
              <tr className="border-b border-border bg-surface-sunken text-left text-text-muted">
                {cols.map((c) => (
                  <th key={String(c.key)} className="px-4 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  {cols.map((c) => (
                    <td key={String(c.key)} className="px-4 py-2 text-text">
                      {c.render
                        ? c.render(item[c.key as keyof T], item)
                        : String(item[c.key as keyof T] ?? "")}
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggle(item)}
                    >
                      {item.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm} title="Nuevo registro">
        <div className="space-y-4 p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="cat-codigo" className="mb-1 block text-sm font-medium text-text">
                Código
              </label>
              <input
                id="cat-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
                placeholder="ej: call_center"
                className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="cat-nombre" className="mb-1 block text-sm font-medium text-text">
                Nombre
              </label>
              <input
                id="cat-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                placeholder="ej: Call Center"
                className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isCreating}>
                Guardar
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
