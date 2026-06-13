import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const { user, logout } = useSession();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <button
        type="button"
        onClick={onOpenPalette}
        className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-sunken"
      >
        Buscar… <kbd className="ml-2 text-xs">⌘K</kbd>
      </button>
      <div className="flex items-center gap-3 text-sm">
        {user && (
          <span className="text-text-muted">
            {user.nombre} · {user.roles.join(", ")}
          </span>
        )}
        <ThemeToggle />
        <Button variant="outline" size="sm" onClick={logout}>
          Salir
        </Button>
      </div>
    </header>
  );
}
