import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { usePrestamos } from "@/lib/api/queries";
import { DataTable } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";
import type { components } from "@/lib/api/schema";

type Prestamo = components["schemas"]["PrestamoOut"];

export function PrestamosPage() {
  const { data, isLoading, isError } = usePrestamos();
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<Prestamo, unknown>[]>(
    () => [
      { accessorKey: "id", header: "Préstamo" },
      {
        accessorKey: "capital",
        header: "Capital",
        cell: ({ row }) => <MoneyText value={row.original.capital ?? null} />,
      },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: ({ row }) => <Badge tone="success">{row.original.estado}</Badge>,
      },
      { accessorKey: "fecha_desembolso", header: "Desembolso" },
    ],
    [],
  );

  if (isLoading) return <div className="animate-pulse text-foreground/40">Cargando préstamos…</div>;
  if (isError)
    return (
      <div role="alert" className="text-red-700">
        No se pudieron cargar los préstamos.
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Préstamos</h1>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        emptyMessage="No hay préstamos."
        onRowClick={(p) => navigate({ to: `/prestamos/${p.id}` as string })}
      />
    </div>
  );
}
