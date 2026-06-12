import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-white p-4", className)}>{children}</div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-foreground/80">{children}</h3>;
}
