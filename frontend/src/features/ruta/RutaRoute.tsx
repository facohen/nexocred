import { useRutas } from "./hooks";
import { RutaPage } from "./RutaPage";

/**
 * Route entry for La Ruta: resolves the cobrador's current (abierta) route and
 * renders RutaPage for it. In a real device this would be the route assigned
 * for today.
 */
export function RutaRoute() {
  const rutasQ = useRutas();
  const rutas = rutasQ.data?.data ?? [];
  const abierta = rutas.find((r) => r.estado === "abierta") ?? rutas[0];

  if (rutasQ.isLoading) {
    return <p className="p-4 text-sm text-text-muted">Cargando ruta…</p>;
  }
  if (rutasQ.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-neg">
        No se pudo cargar la ruta asignada.
      </p>
    );
  }
  if (!abierta) {
    return <p className="p-4 text-sm text-text-muted">No tenés rutas asignadas.</p>;
  }
  return <RutaPage rutaId={abierta.id} />;
}
