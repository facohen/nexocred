import { cn } from "@/lib/utils";

/**
 * Escala de mora ORDINAL de 5 puntos (no un booleano de riesgo). El texto
 * SIEMPRE acompaña al color — nunca color solo (WCAG + daltonismo).
 */
export type RiskBucket = "al_dia" | "par30" | "par60" | "par90" | "castigo";

export function bucketFromDias(diasAtraso: number): RiskBucket {
  if (diasAtraso <= 0) return "al_dia";
  if (diasAtraso <= 30) return "par30";
  if (diasAtraso <= 60) return "par60";
  if (diasAtraso <= 90) return "par90";
  return "castigo";
}

const META: Record<RiskBucket, { label: string; dot: string; chip: string }> = {
  al_dia: { label: "Al día", dot: "bg-risk-0", chip: "bg-pos-bg text-pos border-pos-border" },
  par30: { label: "PAR30", dot: "bg-risk-30", chip: "bg-warn-bg text-warn border-warn-border" },
  par60: { label: "PAR60", dot: "bg-risk-60", chip: "bg-warn-bg text-warn border-warn-border" },
  par90: { label: "PAR90", dot: "bg-risk-90", chip: "bg-neg-bg text-neg border-neg-border" },
  castigo: {
    label: "Castigo",
    dot: "bg-risk-castigo",
    chip: "bg-neg-bg text-risk-castigo border-neg-border",
  },
};

/** Punto de color para celdas estrechas (texto en title para accesibilidad). */
export function MoraDot({ dias, className }: { dias: number; className?: string }) {
  const meta = META[bucketFromDias(dias)];
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className={cn("inline-block h-2 w-2 rounded-full", meta.dot, className)}
    />
  );
}

/** Chip con texto + color para la escala de mora. */
export function RiskBadge({
  dias,
  bucket,
  className,
}: {
  dias?: number;
  bucket?: RiskBucket;
  className?: string;
}) {
  const b = bucket ?? bucketFromDias(dias ?? 0);
  const meta = META[b];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.chip,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
