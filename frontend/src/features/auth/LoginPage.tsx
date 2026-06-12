import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { useSession, type Rol } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api/schema";

type TokenOut = components["schemas"]["TokenOut"];

/** Decode the rol(es) from the email convention used by the mock/login. */
function rolesFor(email: string): Rol[] {
  const prefix = email.split("@")[0];
  const known: Rol[] = ["admin", "analista", "cobrador", "vendedor", "operador", "tesoreria"];
  const match = known.find((r) => prefix.includes(r));
  return match ? [match] : ["operador"];
}

export function LoginPage({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      login(token, { email, nombre: email.split("@")[0], roles: rolesFor(email) });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-bold">NexoCred</h1>
        <p className="text-sm text-foreground/60">Ingresá tus credenciales</p>
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
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </div>
  );
}
