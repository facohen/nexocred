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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr] bg-bg">
      {/* ── Panel de marca (domina la composición) ───────────────────── */}
      <aside
        className="relative isolate flex flex-col justify-between overflow-hidden px-8 py-10 lg:px-14 lg:py-16"
        style={{
          backgroundColor: "hsl(var(--brand))",
          color: "hsl(var(--brand-foreground))",
        }}
      >
        {/* Rejilla geométrica (solo CSS, sin imágenes) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--brand-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-foreground)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(120% 90% at 80% 10%, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 80% 10%, black 30%, transparent 75%)",
          }}
        />
        {/* Halo difuso para dar profundidad */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 -z-10 h-[28rem] w-[28rem] rounded-full opacity-30 blur-3xl"
          style={{ backgroundColor: "hsl(var(--brand-hover))" }}
        />

        <header className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-lg text-base font-bold shadow-sm"
            style={{
              backgroundColor: "hsl(var(--brand-foreground))",
              color: "hsl(var(--brand))",
            }}
            aria-hidden
          >
            N
          </span>
          <span className="text-sm font-semibold uppercase tracking-[0.18em] opacity-80">
            NexoCred
          </span>
        </header>

        <div className="max-w-md py-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] opacity-70">
            Plataforma de originación y cobranza
          </p>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight lg:text-6xl">
            Crédito
            <br />
            que se gestiona
            <br />
            <span className="opacity-60">sin fricción.</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed opacity-80 lg:text-base">
            Originá, evaluá riesgo y cobrá desde una sola bandeja. Decisiones con contexto, números
            con trazabilidad.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[hsl(var(--brand-foreground)/0.18)]">
          {[
            { k: "Cartera viva", v: "$48.2M" },
            { k: "Mora 90+", v: "3.1%" },
            { k: "Aprobación", v: "72%" },
          ].map((stat) => (
            <div
              key={stat.k}
              className="bg-[hsl(var(--brand-foreground)/0.06)] px-4 py-3.5 backdrop-blur-sm"
            >
              <dd
                className="text-lg font-semibold tracking-tight lg:text-xl"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                {stat.v}
              </dd>
              <dt className="mt-0.5 text-[0.7rem] uppercase tracking-wide opacity-65">{stat.k}</dt>
            </div>
          ))}
        </dl>
      </aside>

      {/* ── Panel de formulario ──────────────────────────────────────── */}
      <main className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight text-text">Ingresar</h2>
            <p className="text-sm text-text-muted">Accedé con tus credenciales de NexoCred.</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm"
          >
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-text">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand))]"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-text">
                Contraseña
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-16 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand))]"
                  style={{ fontFamily: "'Geist Mono', monospace" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar la clave" : "Mostrar la clave"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-semibold uppercase tracking-wide text-text-subtle transition-colors duration-150 hover:text-brand"
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-neg-border bg-neg-bg px-3.5 py-3"
              >
                <span
                  aria-hidden
                  className="mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full bg-neg text-[0.6rem] font-bold text-white"
                >
                  !
                </span>
                <p className="text-sm font-medium leading-snug text-neg">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full gap-2 bg-brand hover:bg-brand-hover"
              disabled={loading}
            >
              {loading && (
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
                />
              )}
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          {/* Hint de usuarios demo */}
          <div className="rounded-xl border border-border bg-surface-sunken p-4">
            <p className="mb-2.5 flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-wide text-text-subtle">
              <span>Usuarios de demo</span>
              <span
                className="rounded bg-surface px-1.5 py-0.5 text-text-muted"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                {DEMO_PASSWORD}
              </span>
            </p>
            <div className="space-y-0.5">
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
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150 ${
                      isActive
                        ? "bg-surface shadow-sm ring-1 ring-[hsl(var(--brand)/0.4)]"
                        : "hover:bg-surface"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 flex-none rounded-full transition-colors duration-150 ${
                        isActive ? "bg-brand" : "bg-border-strong"
                      }`}
                    />
                    <span
                      className={`w-28 flex-none truncate text-sm font-medium capitalize ${
                        isActive ? "text-brand" : "text-text"
                      }`}
                    >
                      {rol}
                    </span>
                    <span
                      className="flex-1 truncate text-right text-xs text-text-subtle"
                      style={{ fontFamily: "'Geist Mono', monospace" }}
                    >
                      {demoEmail}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
