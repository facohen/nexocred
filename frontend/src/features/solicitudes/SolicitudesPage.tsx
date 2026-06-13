import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useSolicitudes } from "@/lib/api/queries";
import { DataTable } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import type { components } from "@/lib/api/schema";

type Solicitud = components["schemas"]["SolicitudOut"];

const ESTADO_TONE: Record<string, "default" | "success" | "warning" | "danger"> = {
  ingresada: "default",
  en_evaluacion: "warning",
  evaluada: "warning",
  aprobada: "success",
  rechazada: "danger",
  desembolsada: "success",
};

export function SolicitudesPage() {
  const { data, isLoading, isError } = useSolicitudes();
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<Solicitud, unknown>[]>(
    () => [
      { accessorKey: "id", header: "Solicitud" },
      {
        accessorKey: "monto",
        header: "Monto",
        cell: ({ row }) => <MoneyText value={row.original.monto ?? null} />,
      },
      { accessorKey: "cantidad_cuotas", header: "Cuotas" },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: ({ row }) => (
          <Badge tone={ESTADO_TONE[row.original.estado] ?? "default"}>{row.original.estado}</Badge>
        ),
      },
    ],
    [],
  );

  if (isLoading) return <div className="animate-pulse text-text-subtle">Cargando solicitudes…</div>;
  if (isError)
    return (
      <div role="alert" className="text-neg">
        No se pudieron cargar las solicitudes.
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Solicitudes</h1>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        emptyMessage="No hay solicitudes."
        onRowClick={(s) => navigate({ to: `/solicitudes/${s.id}` as string })}
      />
    </div>
  );
}
