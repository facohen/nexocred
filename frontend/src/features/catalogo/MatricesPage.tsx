import { useMemo } from "react";
import { useMatrizTasas } from "@/lib/api/queries";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

type RiskBucket = "0" | "30" | "60" | "90" | "castigo";

const BUCKET_STYLE: Record<RiskBucket, { cell: string; chip: string }> = {
  "0": { cell: "bg-risk-0/12 text-risk-0", chip: "bg-risk-0/15 text-risk-0" },
  "30": { cell: "bg-risk-30/12 text-risk-30", chip: "bg-risk-30/15 text-risk-30" },
  "60": { cell: "bg-risk-60/14 text-risk-60", chip: "bg-risk-60/18 text-risk-60" },
  "90": { cell: "bg-risk-90/14 text-risk-90", chip: "bg-risk-90/18 text-risk-90" },
  castigo: {
    cell: "bg-risk-castigo/16 text-risk-castigo",
    chip: "bg-risk-castigo/20 text-risk-castigo",
  },
};

const BUCKET_ORDER: RiskBucket[] = ["0", "30", "60", "90", "castigo"];

/**
 * Maps a rate string to a risk bucket by its position within the observed
 * range. Tasa stays a string everywhere it is rendered; we only parse a numeric
 * copy here to drive color, never to display.
 */
function parseRate(tasa: string): number | null {
  const n = Number(String(tasa).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function bucketFor(value: number | null, min: number, max: number): RiskBucket | null {
  if (value == null) return null;
  if (max <= min) return "0";
  const t = (value - min) / (max - min);
  if (t < 0.2) return "0";
  if (t < 0.45) return "30";
  if (t < 0.7) return "60";
  if (t < 0.9) return "90";
  return "castigo";
}

export function MatricesPage() {
  const { data, isLoading, isError } = useMatrizTasas();
  const filas = data?.data;

  const { perfiles, plazos, lookup, min, max } = useMemo(() => {
    const rows = filas ?? [];
    const perfilesSet = new Set<string>();
    const plazosSet = new Set<number>();
    const map = new Map<string, string>();
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of rows) {
      perfilesSet.add(f.perfil_pricing_id);
      plazosSet.add(f.plazo);
      map.set(`${f.perfil_pricing_id}|${f.plazo}`, f.tasa);
      const n = parseRate(f.tasa);
      if (n != null) {
        if (n < lo) lo = n;
        if (n > hi) hi = n;
      }
    }
    return {
      perfiles: [...perfilesSet],
      plazos: [...plazosSet].sort((a, b) => a - b),
      lookup: map,
      min: Number.isFinite(lo) ? lo : 0,
      max: Number.isFinite(hi) ? hi : 0,
    };
  }, [filas]);

  const hasRows = perfiles.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-80 animate-pulse rounded-md bg-surface-sunken" />
        <div className="h-72 animate-pulse rounded-xl bg-surface-sunken" />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-neg-border bg-neg-bg px-4 py-3 text-sm text-neg"
      >
        No se pudo cargar la matriz de tasas. Reintentá en unos instantes.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-text">Matriz de tasas</h1>
        <p className="text-sm text-text-muted">
          Tasa de interés directo por perfil de pricing y plazo. El color indica la posición
          relativa de cada tasa dentro del rango vigente.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-text">Interés directo</h2>
            <span className="text-xs text-text-subtle">(%)</span>
          </div>
          {hasRows && (
            <div className="flex items-center gap-2 text-xs text-text-subtle">
              <span>menor</span>
              <div className="flex overflow-hidden rounded-md border border-border">
                {BUCKET_ORDER.map((b) => (
                  <span key={b} className={`h-3 w-5 ${BUCKET_STYLE[b].chip}`} aria-hidden />
                ))}
              </div>
              <span>mayor</span>
            </div>
          )}
        </div>

        {!hasRows ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-text">No hay tasas configuradas.</p>
            <p className="mt-1 text-sm text-text-subtle">
              Definí perfiles de pricing y plazos para ver la matriz.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-border bg-surface-sunken px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Perfil / Plazo
                  </th>
                  {plazos.map((p) => (
                    <th
                      key={p}
                      className="border-b border-l border-border bg-surface-sunken px-4 py-2.5 text-right text-xs font-semibold text-text-muted"
                      style={MONO}
                    >
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perfiles.map((perfil) => (
                  <tr key={perfil} className="group">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[12rem] truncate border-b border-border bg-surface-sunken px-4 py-2.5 text-left text-sm font-medium text-text transition-colors duration-150 group-hover:bg-surface"
                      title={perfil}
                    >
                      {perfil}
                    </th>
                    {plazos.map((plazo) => {
                      const tasa = lookup.get(`${perfil}|${plazo}`);
                      const bucket = bucketFor(tasa == null ? null : parseRate(tasa), min, max);
                      const style = bucket ? BUCKET_STYLE[bucket].cell : "text-text-subtle";
                      return (
                        <td
                          key={plazo}
                          className={`border-b border-l border-border px-4 py-2.5 text-right text-sm font-semibold transition-all duration-150 ${style}`}
                          style={MONO}
                        >
                          {/* Tasa is a string — rendered verbatim, never Number()d for display. */}
                          {tasa ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
