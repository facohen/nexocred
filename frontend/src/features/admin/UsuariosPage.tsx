import { useMemo, useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useUsuarios, useDesactivarUsuario } from "@/lib/api/queries";
import { UsuarioFormDialog } from "./UsuarioFormDialog";
import type { components } from "@/lib/api/schema";

type UsuarioOut = components["schemas"]["UsuarioOut"];

const MONO: CSSProperties = { fontFamily: "'Geist Mono', monospace" };

/* ──────────────────────────────────────────────────────────────────────────
 * Roles → identidad de color. Cada rol mapea a un token semántico existente.
 * Nada de hex/rgb; solo hsl(var(--token)). El rol pinta el avatar y el badge,
 * así la tabla "se lee" por color sin leer texto.
 * ────────────────────────────────────────────────────────────────────────── */
type RoleStyle = { varName: string; label: string };

const ROLE_STYLES: Record<string, RoleStyle> = {
  admin_sistema: { varName: "--neg", label: "Admin sistema" },
  ceo: { varName: "--brand", label: "CEO" },
  analista_riesgo: { varName: "--warn", label: "Riesgo" },
  administrativo: { varName: "--info", label: "Administrativo" },
  vendedor: { varName: "--pos", label: "Vendedor" },
};

const FALLBACK_ROLE: RoleStyle = { varName: "--brand", label: "" };

function roleStyle(role: string): RoleStyle {
  return ROLE_STYLES[role] ?? { ...FALLBACK_ROLE, label: role };
}

/** Rol "primario" para teñir el avatar: el más alto en la jerarquía visible. */
const ROLE_PRIORITY = ["admin_sistema", "ceo", "analista_riesgo", "administrativo", "vendedor"];

function primaryRole(roles: string[]): string | null {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return roles[0] ?? null;
}

function initialsFor(nombre: string, email: string): string {
  const source = nombre.trim() || email.trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// ─── Hero search ──────────────────────────────────────────────────────────────

function HeroSearch({
  value,
  onChange,
  count,
}: {
  value: string;
  onChange: (v: string) => void;
  count: number | null;
}) {
  return (
    <div className="group relative">
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-focus-within:opacity-100"
        style={{
          background: "hsl(var(--brand) / 0.06)",
          boxShadow: "0 0 0 3px hsl(var(--brand) / 0.12)",
        }}
      />
      <div
        className="relative flex items-center gap-3 rounded-2xl border px-5 transition-all duration-200 focus-within:border-brand"
        style={{
          minHeight: "3.25rem",
          background: "hsl(var(--surface))",
          borderColor: "hsl(var(--border-strong))",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <span
          className="shrink-0 transition-colors duration-150"
          style={{ color: value ? "hsl(var(--brand))" : "hsl(var(--text-subtle))" }}
        >
          <SearchIcon className="h-5 w-5" />
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar por nombre, email o rol…"
          aria-label="Buscar usuarios"
          className="h-12 w-full bg-transparent text-[0.9375rem] text-text placeholder:text-text-subtle focus:outline-none"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-text-subtle transition-all duration-150 hover:bg-surface-sunken hover:text-text"
          >
            Limpiar
          </button>
        ) : count !== null ? (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-text-muted"
            style={{ ...MONO, background: "hsl(var(--surface-sunken))" }}
          >
            {count}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Role legend ──────────────────────────────────────────────────────────────

function RoleLegend({ counts }: { counts: Record<string, number> }) {
  const present = ROLE_PRIORITY.filter((r) => (counts[r] ?? 0) > 0);
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {present.map((role) => {
        const { varName, label } = roleStyle(role);
        return (
          <span key={role} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: `hsl(var(${varName}))` }}
            />
            <span className="text-text-subtle">{label}</span>
            <span style={MONO} className="text-text-muted">
              {counts[role]}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="divide-y divide-border" aria-busy="true" role="status">
      <span className="sr-only">Cargando usuarios…</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div
            className="h-10 w-10 shrink-0 animate-pulse rounded-full"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 70}ms` }}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div
              className="h-3.5 animate-pulse rounded-md"
              style={{
                width: `${36 + (i % 4) * 12}%`,
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${i * 70}ms`,
              }}
            />
            <div
              className="h-2.5 w-40 animate-pulse rounded-md"
              style={{
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${i * 70 + 35}ms`,
              }}
            />
          </div>
          <div
            className="h-5 w-20 shrink-0 animate-pulse rounded-full"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 70 + 20}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Empty / error states ─────────────────────────────────────────────────────

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  const filtered = query.trim().length > 0;
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{
          background: "hsl(var(--brand-subtle))",
          boxShadow: "0 0 0 6px hsl(var(--brand) / 0.06)",
        }}
      >
        {filtered ? (
          <SearchIcon className="h-7 w-7 text-brand" />
        ) : (
          <UsersIcon className="h-7 w-7 text-brand" />
        )}
      </div>
      <p className="text-base font-semibold text-text">
        {filtered ? "Sin resultados" : "Todavía no hay usuarios"}
      </p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-muted">
        {filtered ? (
          <>
            Ningún usuario coincide con{" "}
            <span className="font-medium text-text" style={MONO}>
              "{query}"
            </span>
            . Probá con otro nombre, email o rol.
          </>
        ) : (
          "Creá el primer usuario para darle acceso al sistema y asignarle roles."
        )}
      </p>
      {filtered && (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted transition-all duration-150 hover:bg-surface-sunken hover:text-text"
        >
          Limpiar búsqueda
        </button>
      )}
    </div>
  );
}

function ErrorState() {
  return (
    <div
      role="alert"
      className="rounded-2xl border px-6 py-12 text-center"
      style={{ borderColor: "hsl(var(--neg-border))", background: "hsl(var(--neg-bg))" }}
    >
      <p className="text-base font-semibold" style={{ color: "hsl(var(--neg))" }}>
        No se pudieron cargar los usuarios
      </p>
      <p className="mt-1 text-sm" style={{ color: "hsl(var(--neg) / 0.75)" }}>
        Hubo un problema al consultar el directorio. Reintentá en unos segundos.
      </p>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function UsuarioRow({
  usuario,
  onEdit,
  onDeactivate,
}: {
  usuario: UsuarioOut;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const roles = usuario.roles ?? [];
  const primary = primaryRole(roles);
  const accentVar = primary ? roleStyle(primary).varName : "--brand";
  const dimmed = !usuario.activo;

  return (
    <div
      className="group flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-sunken"
      style={{ opacity: dimmed ? 0.62 : 1 }}
    >
      {/* Avatar — teñido por rol primario */}
      <span
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-transform duration-150 group-hover:scale-105"
        style={{
          background: `hsl(var(${accentVar}) / 0.12)`,
          color: `hsl(var(${accentVar}))`,
          border: `1.5px solid hsl(var(${accentVar}) / 0.25)`,
        }}
        aria-hidden="true"
      >
        {initialsFor(usuario.nombre, usuario.email)}
        {/* Status dot, esquina inferior derecha */}
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full"
          style={{
            background: `hsl(var(${usuario.activo ? "--pos" : "--neg"}))`,
            boxShadow: "0 0 0 2px hsl(var(--surface))",
          }}
          title={usuario.activo ? "Activo" : "Inactivo"}
        />
      </span>

      {/* Nombre + email */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold leading-snug text-text">
          {usuario.nombre || <span className="text-text-subtle">Sin nombre</span>}
        </span>
        <span className="mt-0.5 truncate text-xs text-text-subtle" style={MONO}>
          {usuario.email}
        </span>
      </div>

      {/* Roles — badge por rol con color semántico */}
      <div className="hidden min-w-0 max-w-[14rem] flex-wrap justify-end gap-1 sm:flex">
        {roles.length === 0 ? (
          <span className="text-xs text-text-subtle">sin rol</span>
        ) : (
          roles.map((r) => {
            const { varName, label } = roleStyle(r);
            return (
              <span
                key={r}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: `hsl(var(${varName}) / 0.12)`,
                  color: `hsl(var(${varName}))`,
                  border: `1px solid hsl(var(${varName}) / 0.22)`,
                }}
              >
                {label || r}
              </span>
            );
          })
        )}
      </div>

      {/* Estado — texto explícito para accesibilidad */}
      <span className="hidden shrink-0 md:block">
        <Badge tone={usuario.activo ? "success" : "default"}>
          {usuario.activo ? "Activo" : "Inactivo"}
        </Badge>
      </span>

      {/* Acciones */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={onEdit}>
          Editar
        </Button>
        {usuario.activo && (
          <Button size="sm" variant="ghost" onClick={onDeactivate}>
            Desactivar
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function UsuariosPage() {
  const { data, isLoading, isError } = useUsuarios();
  const desactivar = useDesactivarUsuario();

  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<UsuarioOut | null>(null);
  const [aDesactivar, setADesactivar] = useState<UsuarioOut | null>(null);

  const usuarios = useMemo(() => data?.data ?? [], [data]);

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return usuarios;
    return usuarios.filter((u) => {
      const roleLabels = (u.roles ?? []).map((r) => roleStyle(r).label.toLowerCase()).join(" ");
      return (
        u.nombre.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.roles ?? []).join(" ").toLowerCase().includes(term) ||
        roleLabels.includes(term)
      );
    });
  }, [usuarios, q]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of usuarios) {
      for (const r of u.roles ?? []) counts[r] = (counts[r] ?? 0) + 1;
    }
    return counts;
  }, [usuarios]);

  const activos = useMemo(() => usuarios.filter((u) => u.activo).length, [usuarios]);
  const count = isLoading || isError ? null : filtrados.length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-3xl font-bold tracking-tight text-text"
              style={{ letterSpacing: "-0.02em" }}
            >
              Usuarios
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Acceso, roles y estado del equipo de la plataforma.
            </p>
          </div>
          <Button onClick={() => setCreando(true)} className="mt-1 gap-2">
            <PlusIcon className="h-4 w-4" />
            Nuevo usuario
          </Button>
        </div>

        {!isLoading && !isError && usuarios.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "hsl(var(--pos))" }}
              />
              <span style={MONO} className="text-text">
                {activos}
              </span>
              activos
              <span className="text-text-subtle">de</span>
              <span style={MONO} className="text-text-muted">
                {usuarios.length}
              </span>
            </span>
            <RoleLegend counts={roleCounts} />
          </div>
        )}
      </header>

      <HeroSearch value={q} onChange={setQ} count={count} />

      {isError ? (
        <ErrorState />
      ) : (
        <section
          className="overflow-hidden rounded-2xl border border-border bg-surface"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          {isLoading ? (
            <SkeletonRows />
          ) : filtrados.length === 0 ? (
            <EmptyState query={q} onClear={() => setQ("")} />
          ) : (
            <div className="divide-y divide-border">
              {filtrados.map((u) => (
                <UsuarioRow
                  key={u.id}
                  usuario={u}
                  onEdit={() => setEditando(u)}
                  onDeactivate={() => setADesactivar(u)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {creando && <UsuarioFormDialog open onOpenChange={setCreando} />}
      {editando && (
        <UsuarioFormDialog
          key={editando.id}
          open
          onOpenChange={(o) => !o && setEditando(null)}
          usuario={editando}
        />
      )}

      <Dialog
        open={Boolean(aDesactivar)}
        onOpenChange={(o) => !o && setADesactivar(null)}
        title="Desactivar usuario"
      >
        <p className="text-sm text-text-muted">
          ¿Seguro que querés desactivar a{" "}
          <span className="font-medium text-text">{aDesactivar?.nombre}</span>? No podrá iniciar
          sesión hasta que se reactive.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setADesactivar(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={desactivar.isPending}
            onClick={() => {
              if (!aDesactivar) return;
              desactivar.mutate(aDesactivar.id, { onSuccess: () => setADesactivar(null) });
            }}
          >
            {desactivar.isPending ? "Desactivando…" : "Desactivar"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
