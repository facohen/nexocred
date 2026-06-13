import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "default" | "success" | "warning" | "danger" | "info" | "brand";

const tones: Record<BadgeTone, string> = {
  default: "bg-surface-sunken text-text-muted border border-border",
  success: "bg-pos-bg text-pos border border-pos-border",
  warning: "bg-warn-bg text-warn border border-warn-border",
  danger: "bg-neg-bg text-neg border border-neg-border",
  info: "bg-info-bg text-info border border-info-border",
  brand: "bg-brand-subtle text-brand border border-transparent",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
