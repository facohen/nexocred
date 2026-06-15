import { useState } from "react";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCrearUsuario, useActualizarUsuario } from "@/lib/api/queries";
import type { components } from "@/lib/api/schema";

type UsuarioOut = components["schemas"]["UsuarioOut"];

// Roles del sistema (seed backend). No hay endpoint de roles, así que la lista es
// una constante local; el backend valida los nombres al asignar.
export const ROLES_SISTEMA = [
  "vendedor",
  "analista_riesgo",
  "administrativo",
  "ceo",
  "admin_sistema",
] as const;

const crearSchema = z.object({
  email: z.string().email("Email inválido"),
  nombre: z.string().min(1, "Requerido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  roles: z.array(z.string()).min(1, "Asigná al menos un rol"),
});

const editarSchema = z.object({
  nombre: z.string().min(1, "Requerido"),
  roles: z.array(z.string()).min(1, "Asigná al menos un rol"),
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Si viene, el diálogo edita ese usuario; si no, crea uno nuevo. */
  usuario?: UsuarioOut | null;
}

/**
 * Alta/edición de usuario. En alta pide email+nombre+password+roles; en edición
 * solo nombre+roles (el backend no acepta cambiar email ni password vía PATCH).
 */
export function UsuarioFormDialog({ open, onOpenChange, usuario }: Props) {
  const editando = Boolean(usuario);
  const crear = useCrearUsuario();
  const actualizar = useActualizarUsuario();

  const [email, setEmail] = useState(usuario?.email ?? "");
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(usuario?.roles ?? []);
  const [error, setError] = useState<string | null>(null);

  const pendiente = crear.isPending || actualizar.isPending;

  const toggleRol = (rol: string) =>
    setRoles((prev) => (prev.includes(rol) ? prev.filter((r) => r !== rol) : [...prev, rol]));

  const onGuardar = () => {
    setError(null);
    if (editando && usuario) {
      const parsed = editarSchema.safeParse({ nombre, roles });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
        return;
      }
      actualizar.mutate(
        { id: usuario.id, body: parsed.data },
        {
          onSuccess: () => onOpenChange(false),
          onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar"),
        },
      );
      return;
    }
    const parsed = crearSchema.safeParse({ email, nombre, password, roles });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    crear.mutate(parsed.data, {
      onSuccess: () => onOpenChange(false),
      onError: (e) => setError(e instanceof Error ? e.message : "No se pudo crear"),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editando ? "Editar usuario" : "Nuevo usuario"}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="usuario-email" className="text-sm font-medium text-text">
            Email
          </label>
          <Input
            id="usuario-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={editando}
            className="mt-1"
            placeholder="persona@nexocred.test"
          />
          {editando && (
            <p className="mt-1 text-xs text-text-subtle">El email no se puede cambiar.</p>
          )}
        </div>

        <div>
          <label htmlFor="usuario-nombre" className="text-sm font-medium text-text">
            Nombre
          </label>
          <Input
            id="usuario-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mt-1"
          />
        </div>

        {!editando && (
          <div>
            <label htmlFor="usuario-password" className="text-sm font-medium text-text">
              Contraseña
            </label>
            <Input
              id="usuario-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-medium text-text">Roles</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ROLES_SISTEMA.map((rol) => (
              <label
                key={rol}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm capitalize hover:bg-surface-sunken"
              >
                <input
                  type="checkbox"
                  checked={roles.includes(rol)}
                  onChange={() => toggleRol(rol)}
                  className="h-4 w-4 accent-brand"
                />
                {rol}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-neg-border bg-neg-bg p-2 text-sm text-neg"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={pendiente}>
            {pendiente ? "Guardando…" : editando ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
