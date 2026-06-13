import { useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CommandPalette } from "@/components/CommandPalette";
import { ConnectivityProvider } from "@/lib/connectivity";
import { useOnline } from "@/features/ruta/useOnline";

/** Rutas EXENTAS del guard de mostrador: La Ruta de campo opera offline a
 * propósito (cola idempotente). Todo lo demás es "mostrador". */
const RUTAS_OFFLINE_PERMITIDO = ["/ruta", "/rendicion"];

function esRutaDeCampo(pathname: string): boolean {
  return RUTAS_OFFLINE_PERMITIDO.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const online = useOnline();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Mostrador offline → bloquear acciones financieras + banner. La Ruta exenta.
  const bloqueado = !online && !esRutaDeCampo(pathname);

  return (
    <ConnectivityProvider value={{ bloqueado }}>
      <div className="flex min-h-screen bg-bg text-text">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Header onOpenPalette={() => setPaletteOpen(true)} />
          {bloqueado && (
            <div
              role="alert"
              data-testid="banner-offline"
              className="border-b border-warn-border bg-warn-bg px-6 py-2 text-sm text-warn"
            >
              Esperando conexión — las acciones financieras están deshabilitadas
              hasta recuperar la conexión.
            </div>
          )}
          <main className="flex-1 p-6">{children}</main>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </ConnectivityProvider>
  );
}
