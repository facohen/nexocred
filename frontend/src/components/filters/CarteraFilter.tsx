import { Input } from "@/components/ui/input";
import { parseMoney } from "@/lib/money";
import {
  type FiltroCartera,
  type RangoFecha,
  RANGO_LABELS,
  filtroActivo,
  FILTRO_CARTERA_VACIO,
} from "@/lib/filtros";

export interface OpcionEstado {
  value: string;
  label: string;
}

const RANGOS: RangoFecha[] = ["todos", "mes", "90dias"];

/**
 * Control de filtros reutilizable para listados de cartera: estado, ventana de
 * fecha (todos / último mes / 90 días) y rango de montos. Controlado: recibe el
 * `filtro` actual y emite cambios por `onChange`. El filtrado real lo hace el
 * consumidor con `filtrarCartera`/`pasaFiltro` (lib/filtros), así este control
 * sirve para préstamos, solicitudes, pagos o cualquier lista con esos 3 ejes.
 */
export function CarteraFilter({
  filtro,
  onChange,
  estados,
  labelMonto = "Monto",
}: {
  filtro: FiltroCartera;
  onChange: (filtro: FiltroCartera) => void;
  /** Estados disponibles para el select (los provee cada pantalla). */
  estados: OpcionEstado[];
  /** Etiqueta del eje monto (p. ej. "Capital", "Monto desembolsado"). */
  labelMonto?: string;
}) {
  const set = (parcial: Partial<FiltroCartera>) => onChange({ ...filtro, ...parcial });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        Estado
        <select
          value={filtro.estado}
          onChange={(e) => set({ estado: e.target.value })}
          className="h-9 rounded-md border border-input bg-surface px-2 text-sm text-text"
        >
          <option value="">Todos</option>
          {estados.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-xs text-text-muted">
        Período
        <div
          role="group"
          aria-label="Filtrar por período"
          className="flex overflow-hidden rounded-md border border-input"
        >
          {RANGOS.map((r) => {
            const activo = filtro.rango === r;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={activo}
                onClick={() => set({ rango: r })}
                className={[
                  "px-3 py-1.5 text-sm transition-colors",
                  activo
                    ? "bg-brand text-brand-foreground"
                    : "bg-surface text-text-muted hover:bg-surface-sunken",
                ].join(" ")}
              >
                {RANGO_LABELS[r]}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs text-text-muted">
        {labelMonto} desde
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          value={filtro.montoMin}
          onChange={(e) => set({ montoMin: e.target.value })}
          onBlur={(e) => set({ montoMin: e.target.value ? parseMoney(e.target.value) : "" })}
          placeholder="0"
          className="w-28"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-text-muted">
        {labelMonto} hasta
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          value={filtro.montoMax}
          onChange={(e) => set({ montoMax: e.target.value })}
          onBlur={(e) => set({ montoMax: e.target.value ? parseMoney(e.target.value) : "" })}
          placeholder="sin tope"
          className="w-28"
        />
      </label>

      {filtroActivo(filtro) && (
        <button
          type="button"
          onClick={() => onChange(FILTRO_CARTERA_VACIO)}
          className="ml-auto h-9 self-end rounded-md px-3 text-sm text-brand hover:underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
