import { useForm } from "react-hook-form";
import { useState } from "react";
import { z } from "zod";
import { useCrearPersona } from "@/lib/api/queries";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";

// CUIL: 2 dígitos - 8 dígitos - 1 dígito verificador (formato AR).
const cuilRegex = /^\d{2}-?\d{8}-?\d$/;
// Money strings: dígitos con hasta 2 decimales, sin notación científica/float.
const moneyRegex = /^\d+(\.\d{1,2})?$/;

const schema = z.object({
  apellido: z.string().min(1, "El apellido es obligatorio"),
  nombre: z.string().min(1, "El nombre es obligatorio"),
  dni: z.string().min(6, "DNI inválido"),
  cuil: z.string().regex(cuilRegex, "CUIL inválido (formato 27-30111222-4)"),
  email: z.string().email("Email inválido"),
  ingresos_totales: z
    .string()
    .min(1, "Los ingresos totales son obligatorios")
    .regex(moneyRegex, "Monto inválido"),
  referencia_nombre: z.string().min(1, "Ingresá al menos una referencia"),
  referencia_telefono: z.string().min(1, "El teléfono de la referencia es obligatorio"),
});

type FormValues = z.infer<typeof schema>;

function zodResolver(s: typeof schema) {
  return async (values: FormValues) => {
    const result = s.safeParse(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as string;
      if (!errors[key]) errors[key] = { type: "validation", message: issue.message };
    }
    return { values: {}, errors };
  };
}

export function PersonaForm({ onCreated }: { onCreated: (id: string) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const crear = useCrearPersona();
  const [apiError, setApiError] = useState<string | null>(null);

  async function onSubmit(values: FormValues) {
    setApiError(null);
    // POC subset of PersonaCreate (the backend fills/derives the rest).
    const body = {
      apellido: values.apellido,
      nombre: values.nombre,
      dni: values.dni,
      cuil: values.cuil,
      email: values.email,
      ingresos_totales: values.ingresos_totales,
      referencias: [
        { nombre: values.referencia_nombre, telefono: values.referencia_telefono },
      ],
    } as unknown as components["schemas"]["PersonaCreate"];
    try {
      const persona = await crear.mutateAsync(body);
      onCreated(persona.id);
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "No se pudo crear la persona");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Apellido" required error={errors.apellido} {...register("apellido")} />
        <FormField label="Nombre" required error={errors.nombre} {...register("nombre")} />
        <FormField label="DNI" required error={errors.dni} {...register("dni")} />
        <FormField label="CUIL" required error={errors.cuil} {...register("cuil")} />
        <FormField label="Email" required error={errors.email} {...register("email")} />
        <FormField
          label="Ingresos totales"
          required
          error={errors.ingresos_totales}
          {...register("ingresos_totales")}
        />
      </div>
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Referencia (al menos una)</legend>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Referencia · Nombre"
            required
            error={errors.referencia_nombre}
            {...register("referencia_nombre")}
          />
          <FormField
            label="Referencia · Teléfono"
            required
            error={errors.referencia_telefono}
            {...register("referencia_telefono")}
          />
        </div>
      </fieldset>
      {apiError && (
        <p role="alert" className="text-sm text-red-600">
          {apiError}
        </p>
      )}
      <Button type="submit" disabled={crear.isPending}>
        {crear.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
