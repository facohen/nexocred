import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/**
 * Bandeja de trabajo genérica (patrón inbox-driven). Secciones por urgencia,
 * cada fila con su acción primaria inline. Es el contenedor de los HOMES por
 * rol: el usuario ve "qué tiene que hacer hoy", no una tabla.
 */

export interface InboxSection<T> {
  /** título de la sección (urgencia/tema) */
  title: string;
  /** items de esta sección */
  items: T[];
  /** texto cuando la sección está vacía (opcional) */
  emptyText?: string;
  /** tono del contador (default | danger para vencidos, etc.) */
  accent?: "default" | "danger" | "warning";
}

export function WorkInboxHero({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-xl font-bold text-text">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function WorkInbox<T>({
  sections,
  renderItem,
  keyFor,
}: {
  sections: InboxSection<T>[];
  renderItem: (item: T) => ReactNode;
  keyFor: (item: T) => string;
}) {
  const accentClass: Record<NonNullable<InboxSection<T>["accent"]>, string> = {
    default: "bg-surface-sunken text-text-muted",
    danger: "bg-neg-bg text-neg",
    warning: "bg-warn-bg text-warn",
  };

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.title}>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text">{section.title}</h2>
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                accentClass[section.accent ?? "default"]
              }`}
            >
              {section.items.length}
            </span>
          </div>
          {section.items.length === 0 ? (
            <p className="text-sm text-text-subtle">{section.emptyText ?? "Nada pendiente."}</p>
          ) : (
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li key={keyFor(item)}>{renderItem(item)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** Fila de bandeja: contenido a la izquierda, acción primaria inline a la derecha. */
export function InboxRow({
  title,
  context,
  signals,
  action,
  onClick,
  className,
}: {
  title: ReactNode;
  context?: ReactNode;
  signals?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Card
      className={`flex items-center justify-between gap-3 ${onClick ? "cursor-pointer hover:bg-surface-sunken" : ""} ${className ?? ""}`}
    >
      <div className="min-w-0 flex-1" onClick={onClick}>
        <div className="truncate text-sm font-medium text-text">{title}</div>
        {context && <div className="truncate text-xs text-text-muted">{context}</div>}
        {signals && <div className="mt-1 flex flex-wrap items-center gap-1.5">{signals}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Card>
  );
}
