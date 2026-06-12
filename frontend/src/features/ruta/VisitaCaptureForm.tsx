import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  onGuardar: (v: VisitaEncolada) => void;
  onCancelar: () => void;
}) {
  const [resultado, setResultado] = useState<string>("pago");
  const [monto, setMonto] = useState<string>(parada.saldo_exigible ?? "");
  const [notas, setNotas] = useState<string>("");
  const [geo, setGeo] = useState<{ lat: string; lng: string } | null>(null);
  const [foto, setFoto] = useState<string | null>(null);

  const esPago = resultado === "pago";

  function capturarGeo() {
    // Geotag as metadata. Real device uses geolocation; here we stamp a marker.
    setGeo({ lat: "-34.6037", lng: "-58.3816" });
  }
  function capturarFoto() {
    setFoto(`foto://${parada.id}-${Date.now()}`);
  }

  function guardar() {
    const visita: VisitaEncolada = {
      id: uuidv7(),
      rutaId,
      paradaId: parada.id,
      prestamoId: parada.prestamo_id,
      orden: parada.orden,
      resultado,
      montoCobrado: esPago ? (monto || "0.00") : null,
      pagoId: esPago ? uuidv7() : null,
      fotoUrl: foto,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      notas: notas || null,
      visitadaEn: new Date().toISOString(),
    };
    onGuardar(visita);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div>
        <label htmlFor="resultado" className="text-sm font-medium">
          Resultado
        </label>
        <select
          id="resultado"
          className="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
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
        <Button type="button" onClick={guardar}>
          Guardar visita
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
