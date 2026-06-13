import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useSession, decodeRolesFromToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api/schema";

type TokenOut = components["schemas"]["TokenOut"];

const DEMO_USERS = [
  { rol: "admin",     email: "admin.full@nexocred.test" },
  { rol: "analista",  email: "analista.full@nexocred.test" },
  { rol: "vendedor",  email: "vendedor.full@nexocred.test" },
  { rol: "cobrador",  email: "cobrador_a.full@nexocred.test" },
  { rol: "operador",  email: "operador.full@nexocred.test" },
  { rol: "tesoreria", email: "tesoreria.full@nexocred.test" },
] as const;

const DEMO_PASSWORD = "demo12345";

export function LoginPage({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useSession();
  const [email, setEmail]       = useState("admin.full@nexocred.test");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = await apiFetch<TokenOut>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      const roles = decodeRolesFromToken(token.access_token);
      login(token, { email, nombre: email.split("@")[0], roles });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="w-full max-w-sm space-y-4">

        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-border bg-white p-8 shadow-sm"
        >
          <h1 className="text-xl font-bold">NexoCred</h1>
          <p className="text-sm text-foreground/60">Ingresá tus credenciales</p>

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">Contraseña</label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>

        {/* Hint de usuarios demo */}
        <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/40">
            Usuarios de demo — contraseña: <span className="font-mono">{DEMO_PASSWORD}</span>
          </p>
          <div className="space-y-1">
            {DEMO_USERS.map(({ rol, email: demoEmail }) => (
              <button
                key={rol}
                type="button"
                onClick={() => { setEmail(demoEmail); setPassword(DEMO_PASSWORD); setError(null); }}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="w-20 font-medium capitalize text-foreground/80">{rol}</span>
                <span className="font-mono text-xs text-foreground/50">{demoEmail}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
