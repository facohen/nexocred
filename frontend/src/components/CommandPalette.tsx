import { useEffect } from "react";
import { Command } from "cmdk";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";
import { visibleNav } from "@/lib/nav";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useSession();
  const navigate = useNavigate();
  const items = visibleNav(user?.roles);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Paleta de comandos">
          <Command.Input
            autoFocus
            placeholder="Buscar destino…"
            className="w-full border-b border-border px-4 py-3 text-sm outline-none"
          />
          <Command.List className="max-h-72 overflow-auto p-2">
            <Command.Empty className="px-3 py-2 text-sm text-foreground/60">
              Sin resultados.
            </Command.Empty>
            <Command.Group heading="Ir a">
              {items.map((item) => (
                <Command.Item
                  key={item.to}
                  value={item.label}
                  onSelect={() => {
                    onOpenChange(false);
                    void navigate({ to: item.to as string });
                  }}
                  className="cursor-pointer rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
                >
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
