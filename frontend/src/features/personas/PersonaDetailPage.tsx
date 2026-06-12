import { useParams } from "@tanstack/react-router";
import { usePersona } from "@/lib/api/queries";
import { MoneyText } from "@/components/MoneyText";
import { Card, CardTitle } from "@/components/ui/card";
import { BcraPanel } from "./bcra";
import { TimelinePanel } from "@/features/crm/TimelinePanel";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-foreground/50">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

export function PersonaDetailPage() {
  const { personaId } = useParams({ strict: false }) as { personaId: string };
  const { data: persona, isLoading, isError } = usePersona(personaId);

  if (isError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        No se pudo cargar la ficha de la persona. Reintentá más tarde.
      </div>
    );
  }

  if (isLoading || !persona) {
    return <div className="animate-pulse text-foreground/40">Cargando ficha…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          {persona.apellido}, {persona.nombre}
        </h1>
        <p className="text-sm text-foreground/60">
          DNI {persona.dni} · CUIL {persona.cuil}
        </p>
      </div>

      <Card>
        <CardTitle>Ficha 360</CardTitle>
        <dl className="grid grid-cols-3 gap-4">
          <Field label="Email" value={persona.email} />
          <Field label="Teléfono" value={persona.telefono} />
          <Field label="Estado civil" value={persona.estado_civil} />
          <Field
            label="Domicilio"
            value={`${persona.domicilio_calle} ${persona.domicilio_numero ?? ""}, ${persona.domicilio_localidad}`}
          />
          <Field label="Tipo de vivienda" value={persona.tipo_vivienda} />
          <Field label="Empleador" value={persona.empleador} />
          <Field
            label="Ingresos declarados"
            value={<MoneyText value={persona.ingresos_declarados} />}
          />
          <Field
            label="Ingresos en blanco"
            value={<MoneyText value={persona.ingresos_en_blanco} />}
          />
          <Field label="Ingresos totales" value={<MoneyText value={persona.ingresos_totales} />} />
        </dl>
      </Card>

      <Card>
        <CardTitle>Referencias</CardTitle>
        {(persona.referencias ?? []).length === 0 ? (
          <p className="text-sm text-foreground/50">Sin referencias.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(persona.referencias ?? []).map((r, i) => (
              <li key={r.id ?? i}>
                {r.nombre} — {r.vinculo} — {r.telefono}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TimelinePanel personaId={personaId} />

      <BcraPanel personaId={personaId} />
    </div>
  );
}
