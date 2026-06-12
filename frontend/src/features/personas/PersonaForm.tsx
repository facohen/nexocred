import { useForm } from "react-hook-form";
import { forwardRef, useState } from "react";
import { z } from "zod";
import { useCrearPersona } from "@/lib/api/queries";
import { ApiError } from "@/lib/api/client";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { validarCuil } from "@/lib/cuil";
import type { components } from "@/lib/api/schema";

// CUIL: 2 dígitos - 8 dígitos - 1 dígito verificador (formato AR).
const cuilRegex = /^\d{2}-?\d{8}-?\d$/;
// Money strings: dígitos con hasta 2 decimales, sin notación científica/float.
const moneyRegex = /^\d+(\.\d{1,2})?$/;

const ESTADO_CIVIL = ["soltero", "casado", "divorciado", "viudo", "union_convivencial"] as const;
const TIPO_VIVIENDA = ["propia", "alquilada", "familiar", "prestada"] as const;
const VINCULO = [
  "padre",
  "madre",
  "hermano",
  "conyuge",
  "pareja",
  "hijo",
  "vecino",
  "companero",
  "amigo",
  "otro",
] as const;

const schema = z
  .object({
    apellido: z.string().min(1, "El apellido es obligatorio"),
    nombre: z.string().min(1, "El nombre es obligatorio"),
    dni: z.string().min(6, "DNI inválido"),
    cuil: z
      .string()
      .regex(cuilRegex, "CUIL inválido (formato 27-30111222-5)")
      .refine((c) => validarCuil(c), "CUIL inválido: dígito verificador incorrecto"),
    email: z.string().email("Email inválido"),
    fecha_nac: z.string().min(1, "La fecha de nacimiento es obligatoria"),
    estado_civil: z.enum(ESTADO_CIVIL, {
      errorMap: () => ({ message: "El estado civil es obligatorio" }),
    }),
    tipo_vivienda: z.enum(TIPO_VIVIENDA, {
      errorMap: () => ({ message: "El tipo de vivienda es obligatorio" }),
    }),
    telefono: z.string().min(1, "El teléfono es obligatorio"),
    domicilio_calle: z.string().min(1, "La calle es obligatoria"),
    domicilio_localidad: z.string().min(1, "La localidad es obligatoria"),
    domicilio_provincia: z.string().min(1, "La provincia es obligatoria"),
    ingresos_declarados: z
      .string()
      .min(1, "Los ingresos declarados son obligatorios")
      .regex(moneyRegex, "Monto inválido"),
    ingresos_en_blanco: z
      .string()
      .min(1, "Los ingresos en blanco son obligatorios")
      .regex(moneyRegex, "Monto inválido"),
    ingresos_totales: z
      .string()
      .min(1, "Los ingresos totales son obligatorios")
      .regex(moneyRegex, "Monto inválido"),
    referencia_nombre: z.string().min(1, "Ingresá al menos una referencia"),
    referencia_apellido: z.string().min(1, "El apellido de la referencia es obligatorio"),
    referencia_telefono: z.string().min(1, "El teléfono de la referencia es obligatorio"),
    referencia_vinculo: z.enum(VINCULO, {
      errorMap: () => ({ message: "El vínculo es obligatorio" }),
    }),
  })
  // ingresos_en_blanco no pueden superar ingresos_totales (comparación decimal
  // string-safe: padea las partes entera/decimal, nunca usa Number sobre dinero).
  .refine((v) => !moneyGt(v.ingresos_en_blanco, v.ingresos_totales), {
    message: "Los ingresos en blanco no pueden superar los totales",
    path: ["ingresos_en_blanco"],
  });

/** Compara dos money strings (a > b) sin convertir a float. */
function moneyGt(a: string, b: string): boolean {
  const norm = (s: string) => {
    const [ent = "0", dec = ""] = s.split(".");
    return [ent.padStart(16, "0"), dec.padEnd(2, "0").slice(0, 2)].join("");
  };
  if (!moneyRegex.test(a) || !moneyRegex.test(b)) return false;
  return norm(a) > norm(b);
}

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

const SelectField = forwardRef<
  HTMLSelectElement,
  {
    label: string;
    required?: boolean;
    error?: { message?: string };
    options: readonly string[];
  } & React.SelectHTMLAttributes<HTMLSelectElement>
>(function SelectField({ label, required, error, options, ...rest }, ref) {
  const id = rest.id ?? rest.name;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <select
        id={id}
        ref={ref}
        aria-invalid={Boolean(error)}
        defaultValue=""
        className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
        {...rest}
      >
        <option value="" disabled>
          Seleccionar…
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error.message}
        </p>
      )}
    </div>
  );
});

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
    const body = {
      apellido: values.apellido,
      nombre: values.nombre,
      dni: values.dni,
      cuil: values.cuil,
      email: values.email,
      fecha_nac: values.fecha_nac,
      estado_civil: values.estado_civil,
      tipo_vivienda: values.tipo_vivienda,
      telefono: values.telefono,
      domicilio_calle: values.domicilio_calle,
      domicilio_localidad: values.domicilio_localidad,
      domicilio_provincia: values.domicilio_provincia,
      ingresos_declarados: values.ingresos_declarados,
      ingresos_en_blanco: values.ingresos_en_blanco,
      ingresos_totales: values.ingresos_totales,
      referencias: [
        {
          nombre: values.referencia_nombre,
          apellido: values.referencia_apellido,
          telefono: values.referencia_telefono,
          vinculo: values.referencia_vinculo,
        },
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
          label="Fecha de nacimiento"
          required
          type="date"
          error={errors.fecha_nac}
          {...register("fecha_nac")}
        />
        <SelectField
          label="Estado civil"
          required
          options={ESTADO_CIVIL}
          error={errors.estado_civil}
          {...register("estado_civil")}
        />
        <SelectField
          label="Tipo de vivienda"
          required
          options={TIPO_VIVIENDA}
          error={errors.tipo_vivienda}
          {...register("tipo_vivienda")}
        />
        <FormField label="Teléfono" required error={errors.telefono} {...register("telefono")} />
      </div>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Domicilio</legend>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Calle"
            required
            error={errors.domicilio_calle}
            {...register("domicilio_calle")}
          />
          <FormField
            label="Localidad"
            required
            error={errors.domicilio_localidad}
            {...register("domicilio_localidad")}
          />
          <FormField
            label="Provincia"
            required
            error={errors.domicilio_provincia}
            {...register("domicilio_provincia")}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Ingresos</legend>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            label="Ingresos declarados"
            required
            error={errors.ingresos_declarados}
            {...register("ingresos_declarados")}
          />
          <FormField
            label="Ingresos en blanco"
            required
            error={errors.ingresos_en_blanco}
            {...register("ingresos_en_blanco")}
          />
          <FormField
            label="Ingresos totales"
            required
            error={errors.ingresos_totales}
            {...register("ingresos_totales")}
          />
        </div>
      </fieldset>

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
            label="Referencia · Apellido"
            required
            error={errors.referencia_apellido}
            {...register("referencia_apellido")}
          />
          <FormField
            label="Referencia · Teléfono"
            required
            error={errors.referencia_telefono}
            {...register("referencia_telefono")}
          />
          <SelectField
            label="Referencia · Vínculo"
            required
            options={VINCULO}
            error={errors.referencia_vinculo}
            {...register("referencia_vinculo")}
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
