import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function Header({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const { user, logout } = useSession();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-white px-4">
      <button
        type="button"
        onClick={onOpenPalette}
        className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground/60 hover:bg-muted"
      >
        Buscar… <kbd className="ml-2 text-xs">⌘K</kbd>
      </button>
      <div className="flex items-center gap-3 text-sm">
        {user && (
          <span className="text-foreground/70">
            {user.nombre} · {user.roles.join(", ")}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={logout}>
          Salir
        </Button>
      </div>
    </header>
  );
}
