import { useState } from "react";
import { useSimular } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/MoneyText";

type Tipo = "otorgante" | "cotizador" | "interno";

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "otorgante", label: "Otorgante" },
  { value: "cotizador", label: "Cotizador" },
  { value: "interno", label: "Interno" },
];

function TipoSwitch({ value, onChange }: { value: Tipo; onChange: (t: Tipo) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Tipo de simulación"
      className="inline-flex rounded-lg border border-border bg-surface-sunken p-1"
    >
      {TIPOS.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.value)}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150",
              active ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({
  id,
  label,
  suffix,
  ...input
}: {
  id: string;
  label: string;
  suffix?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-text-subtle">
        {label}
      </label>
      <div className="relative">
        <Input id={id} inputMode="decimal" className="pr-10 font-num" style={MONO} {...input} />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-text-subtle">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function Breakdown({
  label,
  value,
  intent,
}: {
  label: string;
  value: string | null | undefined;
  intent?: "income" | "expense" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <MoneyText value={value ?? null} intent={intent} className="text-base font-semibold" />
    </div>
  );
}

export function SimuladorPage() {
  const [tipo, setTipo] = useState<Tipo>("otorgante");
  const [capital, setCapital] = useState("100000");
  const [tasa, setTasa] = useState("30.00");
  const [plazo, setPlazo] = useState("12");
  const simular = useSimular();
  const resultado = simular.data;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Money/tasa stay strings end-to-end.
    simular.mutate({
      tipo,
      body: { capital, tasa_interes_directo: tasa, cantidad_cuotas: Number(plazo) },
    });
  }

  const cuotaPromedio = resultado?.cuotas?.[0]?.cuota ?? null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Simulador de cuotas</h1>
          <p className="text-sm text-text-muted">
            Calculá el cronograma de un préstamo con interés directo.
          </p>
        </div>
        <TipoSwitch value={tipo} onChange={setTipo} />
      </header>

      {/* Hero calculator — inputs left, big output right */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              id="capital"
              label="Capital"
              suffix="$"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
            />
            <Field
              id="tasa"
              label="Tasa directa"
              suffix="%"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
            />
            <Field
              id="plazo"
              label="Plazo"
              suffix="cuotas"
              value={plazo}
              onChange={(e) => setPlazo(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={simular.isPending} className="w-full sm:w-auto">
            {simular.isPending ? "Simulando…" : "Simular cronograma"}
          </Button>
          {simular.isError && (
            <p role="alert" className="text-sm text-neg">
              No se pudo calcular la simulación. Revisá los valores e intentá de nuevo.
            </p>
          )}
        </form>

        {/* The star: cuota mensual, very large mono, pos color */}
        <aside className="flex flex-col justify-between overflow-hidden rounded-xl border border-brand-border bg-brand-subtle p-5 shadow-sm">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand">
              Cuota mensual
            </p>
            {resultado && cuotaPromedio != null ? (
              <p className="mt-1 text-4xl font-bold leading-none text-pos sm:text-5xl" style={MONO}>
                <MoneyText value={cuotaPromedio} intent="income" className="text-inherit" />
              </p>
            ) : (
              <p
                className="mt-1 text-4xl font-bold leading-none text-text-subtle sm:text-5xl"
                style={MONO}
              >
                —
              </p>
            )}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-brand-border pt-4">
            <Breakdown label="Total capital" value={resultado?.total_capital} />
            <Breakdown label="Total interés" value={resultado?.total_interes} intent="expense" />
            <div className="col-span-2 flex items-baseline justify-between border-t border-brand-border pt-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">
                Total a pagar
              </span>
              <MoneyText value={resultado?.total_a_pagar ?? null} className="text-lg font-bold" />
            </div>
          </dl>
        </aside>
      </div>

      {resultado && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text">Plan de amortización</h2>
            <span className="text-xs text-text-subtle" style={MONO}>
              {resultado.cuotas.length} cuotas · {resultado.periodicidad}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-subtle">
                  <th className="px-5 py-2 font-semibold">#</th>
                  <th className="px-5 py-2 font-semibold">Vencimiento</th>
                  <th className="px-5 py-2 text-right font-semibold">Capital</th>
                  <th className="px-5 py-2 text-right font-semibold">Interés</th>
                  <th className="px-5 py-2 text-right font-semibold">Cuota</th>
                </tr>
              </thead>
              <tbody>
                {resultado.cuotas.map((c) => (
                  <tr
                    key={c.numero}
                    className="border-t border-border odd:bg-surface even:bg-surface-sunken/40 transition-colors duration-150 hover:bg-brand-subtle"
                  >
                    <td className="px-5 py-2 text-text-muted" style={MONO}>
                      {c.numero}
                    </td>
                    <td className="px-5 py-2 text-text-muted" style={MONO}>
                      {c.vencimiento}
                    </td>
                    <td className="px-5 py-2 text-right">
                      <MoneyText value={c.capital} align="right" />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <MoneyText value={c.interes} intent="expense" align="right" />
                    </td>
                    <td className="px-5 py-2 text-right font-semibold">
                      <MoneyText value={c.cuota} align="right" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
