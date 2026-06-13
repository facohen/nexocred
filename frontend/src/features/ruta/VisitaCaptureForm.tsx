import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { FormField } from "@/components/FormField";
import type { components } from "@/lib/api/schema";
import { uuidv7 } from "./uuidv7";
import type { VisitaEncolada } from "./queue";

type Parada = components["schemas"]["ParadaConSaldoOut"];

const RESULTADOS = [
  { value: "pago", label: "Pago" },
  { value: "promesa", label: "Promesa de pago" },
  { value: "ausente", label: "Ausente" },
  { value: "rechazo", label: "Rechazo" },
] as const;

/**
 * Capture a visit for one stop. Builds a fully-stamped VisitaEncolada (device
 * UUIDv7 id + pago_id) and hands it to the parent, which queues it offline.
 * Foto/geo are captured as metadata only (url + lat/lng strings). Money is a
 * string end-to-end — never parsed to a Number.
 */
export function VisitaCaptureForm({
  parada,
  rutaId,
  onGuardar,
  onCancelar,
}: {
  parada: Parada;
  rutaId: string;
  onGuardar: (v: VisitaEncolada) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [visitaId] = useState(() => uuidv7());
  const [pagoId] = useState(() => uuidv7());
  const [resultado, setResultado] = useState<string>("pago");
  const [monto, setMonto] = useState<string>(parada.saldo_exigible ?? "");
  const [notas, setNotas] = useState<string>("");
  const [geo, setGeo] = useState<{ lat: string; lng: string } | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const esPago = resultado === "pago";

  function capturarGeo() {
    // Geotag as metadata. Real device uses geolocation; here we stamp a marker.
    setGeo({ lat: "-34.6037", lng: "-58.3816" });
  }
  function capturarFoto() {
    setFoto(`foto://${parada.id}-${Date.now()}`);
  }

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    try {
      const visita: VisitaEncolada = {
        id: visitaId,
        rutaId,
        paradaId: parada.id,
        prestamoId: parada.prestamo_id,
        orden: parada.orden,
        resultado,
        montoCobrado: esPago ? (monto || "0.00") : null,
        pagoId: esPago ? pagoId : null,
        fotoUrl: foto,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        notas: notas || null,
        visitadaEn: new Date().toISOString(),
      };
      await onGuardar(visita);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-sunken p-3">
      <div>
        <label htmlFor="resultado" className="text-sm font-medium">
          Resultado
        </label>
        <select
          id="resultado"
          className="mt-1 h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
        >
          {RESULTADOS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {esPago && (
        <FormField
          label="Monto cobrado"
          name="montoCobrado"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      )}

      <FormField
        label="Notas"
        name="notas"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={capturarFoto}>
          {foto ? "Foto adjunta ✓" : "Adjuntar foto"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={capturarGeo}>
          {geo ? "Geo capturada ✓" : "Geolocalizar"}
        </Button>
      </div>

      <div className="flex gap-2">
        <TransactionButton type="button" pending={guardando} onClick={guardar}>
          Guardar visita
        </TransactionButton>
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
