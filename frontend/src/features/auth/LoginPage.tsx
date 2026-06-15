import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useSession, decodeRolesFromToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api/schema";

type TokenOut = components["schemas"]["TokenOut"];

const DEMO_USERS = [
  { rol: "vendedor", email: "vendedor.full@nexocred.test" },
  { rol: "analista de riesgo", email: "riesgo.full@nexocred.test" },
  { rol: "administrativo", email: "administrativo.full@nexocred.test" },
  { rol: "ceo", email: "ceo.full@nexocred.test" },
  { rol: "admin sistema", email: "sistema.full@nexocred.test" },
] as const;

const DEMO_PASSWORD = "demo12345";

export function LoginPage({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useSession();
  const [email, setEmail] = useState("vendedor.full@nexocred.test");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm space-y-4">
        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm"
        >
          <h1 className="text-xl font-bold text-text">NexoCred</h1>
          <p className="text-sm text-text-muted">Ingresá tus credenciales</p>

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-neg">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>

        {/* Hint de usuarios demo */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
            Usuarios de demo — contraseña: <span className="font-num">{DEMO_PASSWORD}</span>
          </p>
          <div className="space-y-1">
            {DEMO_USERS.map(({ rol, email: demoEmail }) => {
              const isActive = email === demoEmail;
              return (
                <button
                  key={rol}
                  type="button"
                  onClick={() => {
                    setEmail(demoEmail);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                    isActive ? "bg-brand-subtle ring-1 ring-brand/30" : "hover:bg-surface-sunken"
                  }`}
                >
                  <span
                    className={`w-4 text-center text-xs ${isActive ? "text-brand" : "text-text-subtle"}`}
                  >
                    {isActive ? "▶" : "·"}
                  </span>
                  <span
                    className={`w-20 font-medium capitalize ${isActive ? "text-brand" : "text-text-muted"}`}
                  >
                    {rol}
                  </span>
                  <span className="font-num text-xs text-text-subtle">{demoEmail}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
