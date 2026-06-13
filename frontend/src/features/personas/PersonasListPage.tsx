import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { usePersonas } from "@/lib/api/queries";
import { DataTable } from "@/components/DataTable";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PersonaForm } from "./PersonaForm";
import type { components } from "@/lib/api/schema";

type Persona = components["schemas"]["PersonaListItem"];

export function PersonasListPage() {
  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);
  const { data, isLoading, isError } = usePersonas(q || undefined);
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<Persona, unknown>[]>(
    () => [
      { accessorKey: "apellido", header: "Apellido" },
      { accessorKey: "nombre", header: "Nombre" },
      { accessorKey: "dni", header: "DNI" },
      { accessorKey: "cuil", header: "CUIL" },
      {
        accessorKey: "activo",
        header: "Estado",
        cell: ({ row }) => (
          <Badge tone={row.original.activo ? "success" : "default"}>
            {row.original.activo ? "Activa" : "Inactiva"}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Personas</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar por apellido, DNI o CUIL…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={() => setCreando(true)}>Nueva persona</Button>
        </div>
      </div>
      <Dialog open={creando} onOpenChange={setCreando} title="Nueva persona">
        <PersonaForm
          onCreated={(id) => {
            setCreando(false);
            navigate({ to: `/personas/${id}` as string });
          }}
        />
      </Dialog>
      {isLoading ? (
        <div className="animate-pulse rounded-lg border border-border bg-surface p-8 text-center text-text-subtle">
          Cargando…
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-neg-border bg-neg-bg p-8 text-center text-neg">
          No se pudieron cargar las personas.
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          emptyMessage="No hay personas que coincidan."
          onRowClick={(p) => navigate({ to: `/personas/${p.id}` as string })}
        />
      )}
    </div>
  );
}
