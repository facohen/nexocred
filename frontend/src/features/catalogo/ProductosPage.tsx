import { useState } from "react";
import { useProductos } from "@/lib/api/queries";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/MoneyText";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

type Producto = NonNullable<ReturnType<typeof useProductos>["data"]>["data"][number];

function estadoTone(estado: string): "success" | "warning" {
  return estado === "publicado" ? "success" : "warning";
}

function plazoRange(plazos: number[] | undefined): { min: number; max: number } | null {
  if (!plazos || plazos.length === 0) return null;
  return { min: Math.min(...plazos), max: Math.max(...plazos) };
}

function ProductoSelector({
  producto,
  isActive,
  onSelect,
}: {
  producto: Producto;
  isActive: boolean;
  onSelect: () => void;
}) {
  const rango = plazoRange(producto.plazos_permitidos);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={[
        "group relative block w-full overflow-hidden rounded-xl border bg-surface p-3 text-left transition-all duration-150",
        isActive
          ? "border-brand shadow-sm"
          : "border-border hover:border-border-strong hover:bg-surface-sunken",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "absolute inset-y-0 left-0 w-1 transition-all duration-150",
          isActive ? "bg-brand" : "bg-transparent group-hover:bg-border-strong",
        ].join(" ")}
      />
      <div className="flex items-start justify-between gap-2 pl-1">
        <span className="min-w-0 truncate text-sm font-semibold text-text">{producto.nombre}</span>
        <Badge tone={estadoTone(producto.estado)} className="shrink-0 capitalize">
          {producto.estado}
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-3 pl-1 text-xs text-text-subtle">
        <span style={MONO}>v{producto.version_vigente}</span>
        {rango && (
          <span style={MONO}>
            {rango.min === rango.max ? `${rango.min}` : `${rango.min}–${rango.max}`} cuotas
          </span>
        )}
        {producto.periodicidad && (
          <span className="truncate capitalize">{producto.periodicidad}</span>
        )}
      </div>
    </button>
  );
}

function MetricTile({
  label,
  children,
  emphasis = false,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-3",
        emphasis ? "border-brand-border bg-brand-subtle" : "border-border bg-surface-sunken",
      ].join(" ")}
    >
      <dt className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-text" style={MONO}>
        {children}
      </dd>
    </div>
  );
}

function ProductoDetalle({ producto }: { producto: Producto }) {
  const rango = plazoRange(producto.plazos_permitidos);
  const gastos = producto.gastos ?? [];

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Hero band — brand accent dominates the composition */}
      <header className="relative border-b border-border bg-brand-subtle px-5 py-4">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-brand" />
        <div className="flex items-start justify-between gap-3 pl-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand">Producto</p>
            <h2 className="truncate text-lg font-bold text-text">{producto.nombre}</h2>
            {producto.descripcion && (
              <p className="mt-1 line-clamp-2 text-sm text-text-muted">{producto.descripcion}</p>
            )}
          </div>
          <Badge tone={estadoTone(producto.estado)} className="shrink-0 capitalize">
            {producto.estado}
          </Badge>
        </div>
      </header>

      <div className="space-y-5 p-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile label="Monto mínimo">
            <MoneyText value={producto.monto_minimo ?? null} />
          </MetricTile>
          <MetricTile label="Monto máximo" emphasis>
            <MoneyText value={producto.monto_maximo ?? null} />
          </MetricTile>
          <MetricTile label="Plazo">
            {rango
              ? rango.min === rango.max
                ? `${rango.min} cuotas`
                : `${rango.min}–${rango.max}`
              : "—"}
          </MetricTile>
          <MetricTile label="Versión">v{producto.version_vigente}</MetricTile>
        </dl>

        {(producto.plazos_permitidos?.length ?? 0) > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
              Plazos habilitados
            </p>
            <div className="flex flex-wrap gap-1.5">
              {producto.plazos_permitidos?.map((p) => (
                <span
                  key={p}
                  className="rounded-md border border-border bg-surface-sunken px-2 py-1 text-xs text-text-muted"
                  style={MONO}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-text">Gastos asociados</h3>
            <span className="text-xs text-text-subtle" style={MONO}>
              {gastos.length}
            </span>
          </div>
          {gastos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-6 text-center text-sm text-text-subtle">
              Sin gastos configurados para este producto.
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {gastos.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5 transition-colors duration-150 hover:bg-surface-sunken"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{g.nombre}</p>
                    <p className="text-xs capitalize text-text-subtle">{g.tipo}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-text" style={MONO}>
                    {g.tipo === "porcentaje" ? `${g.valor}%` : <MoneyText value={g.valor} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}

export function ProductosPage() {
  const { data, isLoading, isError } = useProductos();
  const [selected, setSelected] = useState<string | null>(null);
  const productos = data?.data ?? [];
  const detalle = productos.find((p) => p.id === selected) ?? productos[0];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-56 animate-pulse rounded-md bg-surface-sunken" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-xl bg-surface-sunken" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-neg-border bg-neg-bg px-4 py-3 text-sm text-neg"
      >
        No se pudo cargar el catálogo de productos. Reintentá en unos instantes.
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-text">Catálogo de productos</h1>
        <div className="rounded-xl border border-dashed border-border bg-surface-sunken px-6 py-16 text-center">
          <p className="text-sm font-medium text-text">Todavía no hay productos publicados.</p>
          <p className="mt-1 text-sm text-text-subtle">
            Los productos definidos aparecerán acá con sus montos, plazos y gastos.
          </p>
        </div>
      </div>
    );
  }

  const publicados = productos.filter((p) => p.estado === "publicado").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-text">Catálogo de productos</h1>
          <p className="text-sm text-text-muted">
            Compará montos, plazos y gastos de cada línea de crédito.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-subtle">
          <Badge tone="success">{publicados} publicados</Badge>
          <span style={MONO}>{productos.length} totales</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <nav aria-label="Productos" className="space-y-2">
          {productos.map((p) => (
            <ProductoSelector
              key={p.id}
              producto={p}
              isActive={detalle?.id === p.id}
              onSelect={() => setSelected(p.id)}
            />
          ))}
        </nav>
        {detalle && <ProductoDetalle producto={detalle} />}
      </div>
    </div>
  );
}
