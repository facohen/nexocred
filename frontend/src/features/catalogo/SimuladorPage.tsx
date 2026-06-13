import { useState } from "react";
import { useSimular } from "@/lib/api/queries";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/MoneyText";

type Tipo = "otorgante" | "cotizador" | "interno";

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Simulador</h1>

      <div className="flex gap-2">
        {(["otorgante", "cotizador", "interno"] as Tipo[]).map((t) => (
          <Button
            key={t}
            variant={tipo === t ? "default" : "outline"}
            size="sm"
            onClick={() => setTipo(t)}
          >
            {t === "otorgante" ? "Otorgante" : t === "cotizador" ? "Cotizador" : "Interno"}
          </Button>
        ))}
      </div>

      <Card>
        <form onSubmit={onSubmit} className="grid grid-cols-4 items-end gap-4">
          <div className="space-y-1">
            <label htmlFor="capital" className="text-sm font-medium">
              Capital
            </label>
            <Input id="capital" value={capital} onChange={(e) => setCapital(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="tasa" className="text-sm font-medium">
              Tasa (%)
            </label>
            <Input id="tasa" value={tasa} onChange={(e) => setTasa(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="plazo" className="text-sm font-medium">
              Plazo (cuotas)
            </label>
            <Input id="plazo" value={plazo} onChange={(e) => setPlazo(e.target.value)} />
          </div>
          <Button type="submit" disabled={simular.isPending}>
            {simular.isPending ? "Simulando…" : "Simular"}
          </Button>
        </form>
      </Card>

      {resultado && (
        <Card>
          <CardTitle>Cronograma</CardTitle>
          <div className="mb-3 grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-text-subtle">Total capital</dt>
              <dd>
                <MoneyText value={resultado.total_capital} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-subtle">Total interés</dt>
              <dd>
                <MoneyText value={resultado.total_interes} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-subtle">Total a pagar</dt>
              <dd className="font-semibold">
                <MoneyText value={resultado.total_a_pagar} />
              </dd>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="py-1">#</th>
                <th className="py-1">Vencimiento</th>
                <th className="py-1 text-right">Capital</th>
                <th className="py-1 text-right">Interés</th>
                <th className="py-1 text-right">Cuota</th>
              </tr>
            </thead>
            <tbody>
              {resultado.cuotas.map((c) => (
                <tr key={c.numero} className="border-t border-border">
                  <td className="py-1">{c.numero}</td>
                  <td className="py-1">{c.vencimiento}</td>
                  <td className="py-1 text-right">
                    <MoneyText value={c.capital} />
                  </td>
                  <td className="py-1 text-right">
                    <MoneyText value={c.interes} />
                  </td>
                  <td className="py-1 text-right">
                    <MoneyText value={c.cuota} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
