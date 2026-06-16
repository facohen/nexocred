import { useZonas, useSectores } from "@/features/maestros/hooks";

export interface FiltroZonaSector {
  zona_id: string;
  sector_id: string;
}

export const FILTRO_ZONA_SECTOR_VACIO: FiltroZonaSector = {
  zona_id: "",
  sector_id: "",
};

/**
 * Barra de filtros por zona y sector para dashboards (riesgo, tesorería, torre,
 * analytics). Los IDs de zona/sector seleccionados se envían como query params.
 * Controlado: el consumidor mantiene el estado y lo pasa a los hooks de datos.
 */
export function DashboardFilterBar({
  filtro,
  onChange,
}: {
  filtro: FiltroZonaSector;
  onChange: (f: FiltroZonaSector) => void;
}) {
  const { data: zonas } = useZonas();
  const { data: sectores } = useSectores();

  const set = (parcial: Partial<FiltroZonaSector>) =>
    onChange({ ...filtro, ...parcial });

  const activo = Boolean(filtro.zona_id || filtro.sector_id);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Zona
        <select
          value={filtro.zona_id}
          onChange={(e) => set({ zona_id: e.target.value })}
          className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-text"
        >
          <option value="">Todas</option>
          {(zonas?.data ?? []).map((z) => (
            <option key={z.id} value={z.id}>
              {z.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Sector / Canal
        <select
          value={filtro.sector_id}
          onChange={(e) => set({ sector_id: e.target.value })}
          className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-text"
        >
          <option value="">Todos</option>
          {(sectores?.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>

      {activo && (
        <button
          type="button"
          onClick={() => onChange(FILTRO_ZONA_SECTOR_VACIO)}
          className="ml-auto h-9 self-end rounded-md px-3 text-sm text-brand hover:underline"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
