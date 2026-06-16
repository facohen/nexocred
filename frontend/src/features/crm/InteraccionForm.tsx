import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { useTemas, useCanales, useDisposiciones } from "@/features/maestros/hooks";
import { useCrearInteraccion } from "./hooks";

const TIPOS = ["llamada", "visita", "mensaje", "nota"] as const;

const schema = z.object({
  tipo: z.enum(TIPOS, { errorMap: () => ({ message: "El tipo es obligatorio" }) }),
  disposicion_id: z.string().min(1, "La disposición es obligatoria"),
  detalle: z.string().optional(),
  tema_id: z.string().optional(),
  canal_id: z.string().optional(),
  proximo_paso_fecha: z.string().optional(),
  proximo_paso_nota: z.string().optional(),
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

type Props = {
  personaId: string;
  tareaId?: string;
  onCreated?: () => void;
};

export function InteraccionForm({ personaId, tareaId, onCreated }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const crear = useCrearInteraccion();
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: temasData } = useTemas();
  const { data: canalesData } = useCanales();
  const { data: disposicionesData } = useDisposiciones();

  const temas = (temasData?.data ?? []).filter((t) => t.activo);
  const canales = (canalesData?.data ?? []).filter((c) => c.activo);
  const disposiciones = (disposicionesData?.data ?? []).filter((d) => d.activo);

  async function onSubmit(values: FormValues) {
    setApiError(null);
    try {
      await crear.mutateAsync({
        persona_id: personaId,
        tipo: values.tipo,
        detalle: values.detalle || null,
        tarea_id: tareaId ?? null,
        tema_id: values.tema_id || null,
        canal_id: values.canal_id || null,
        disposicion_id: values.disposicion_id,
        proximo_paso_fecha: values.proximo_paso_fecha || null,
        proximo_paso_nota: values.proximo_paso_nota || null,
      });
      reset();
      onCreated?.();
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "No se pudo registrar la interacción");
    }
  }

  return (
    <Card>
      <CardTitle>Nueva interacción</CardTitle>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Tipo */}
          <div className="space-y-1">
            <label htmlFor="tipo" className="text-sm font-medium">
              Tipo <span className="text-neg">*</span>
            </label>
            <select
              id="tipo"
              aria-invalid={Boolean(errors.tipo)}
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
              {...register("tipo")}
            >
              <option value="" disabled>
                Seleccionar…
              </option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            {errors.tipo && (
              <p role="alert" className="text-xs text-neg">
                {errors.tipo.message}
              </p>
            )}
          </div>

          {/* Disposición */}
          <div className="space-y-1">
            <label htmlFor="disposicion_id" className="text-sm font-medium">
              Disposición <span className="text-neg">*</span>
            </label>
            <select
              id="disposicion_id"
              aria-invalid={Boolean(errors.disposicion_id)}
              defaultValue=""
              className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
              {...register("disposicion_id")}
            >
              <option value="" disabled>
                Seleccionar…
              </option>
              {disposiciones.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
            {errors.disposicion_id && (
              <p role="alert" className="text-xs text-neg">
                {errors.disposicion_id.message}
              </p>
            )}
          </div>

          {/* Tema (opcional) */}
          {temas.length > 0 && (
            <div className="space-y-1">
              <label htmlFor="tema_id" className="text-sm font-medium">
                Tema
              </label>
              <select
                id="tema_id"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
                {...register("tema_id")}
              >
                <option value="">Sin tema</option>
                {temas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Canal (opcional) */}
          {canales.length > 0 && (
            <div className="space-y-1">
              <label htmlFor="canal_id" className="text-sm font-medium">
                Canal
              </label>
              <select
                id="canal_id"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
                {...register("canal_id")}
              >
                <option value="">Sin canal</option>
                {canales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Próximo paso — fecha */}
          <div className="space-y-1">
            <label htmlFor="proximo_paso_fecha" className="text-sm font-medium">
              Próximo paso — fecha
            </label>
            <input
              id="proximo_paso_fecha"
              type="date"
              className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm text-text"
              {...register("proximo_paso_fecha")}
            />
          </div>
        </div>

        {/* Detalle */}
        <div className="space-y-1">
          <label htmlFor="detalle" className="text-sm font-medium">
            Detalle / observaciones
          </label>
          <textarea
            id="detalle"
            rows={3}
            className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-text"
            {...register("detalle")}
          />
        </div>

        {/* Próximo paso — nota */}
        <div className="space-y-1">
          <label htmlFor="proximo_paso_nota" className="text-sm font-medium">
            Próximo paso — nota
          </label>
          <textarea
            id="proximo_paso_nota"
            rows={2}
            className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-text"
            {...register("proximo_paso_nota")}
          />
        </div>

        {apiError && (
          <p role="alert" className="text-sm text-neg">
            {apiError}
          </p>
        )}

        <Button type="submit" disabled={crear.isPending}>
          {crear.isPending ? "Guardando…" : "Registrar interacción"}
        </Button>
      </form>
    </Card>
  );
}
