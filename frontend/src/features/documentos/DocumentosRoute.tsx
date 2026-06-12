import { usePrestamos } from "@/lib/api/queries";
import { DocumentosPage } from "./DocumentosPage";

/** Route entry: documentos del primer préstamo (demo); en producción se llega
 * desde el detalle del préstamo. */
export function DocumentosRoute() {
  const q = usePrestamos();
  const prestamos = q.data?.data ?? [];
  const prestamo = prestamos[0];

  if (q.isLoading) return <p className="p-4 text-sm text-foreground/60">Cargando…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-red-700">No se pudieron cargar los préstamos.</p>;
  if (!prestamo) return <p className="p-4 text-sm text-foreground/60">No hay préstamos.</p>;
  return <DocumentosPage prestamoId={prestamo.id} />;
}
