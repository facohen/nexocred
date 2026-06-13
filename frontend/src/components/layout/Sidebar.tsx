import { useSession } from "@/lib/auth";
import { visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { user } = useSession();
  const items = visibleNav(user?.roles);
  const current = typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <nav aria-label="Navegación principal" className="flex w-56 flex-col gap-1 border-r border-border bg-sidebar p-3">
      <div className="mb-4 px-2 text-lg font-bold">NexoCred</div>
      {items.map((item) => (
        <a
          key={item.to}
          href={item.to}
          className={cn(
            "rounded-md px-3 py-2 text-sm text-text-muted hover:bg-sidebar-accent",
            current.startsWith(item.to) && "bg-sidebar-accent font-medium text-brand",
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
