import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useUsuarios, useDesactivarUsuario } from "@/lib/api/queries";
import { UsuarioFormDialog } from "./UsuarioFormDialog";
import type { components } from "@/lib/api/schema";

type UsuarioOut = components["schemas"]["UsuarioOut"];

/**
 * Gestión de usuarios (admin). Lista los usuarios del sistema con sus roles y
 * estado, y permite crear / editar (nombre + roles) / desactivar. Reusa el CRUD
 * existente del backend (m12_auth); no mueve plata.
 */
export function UsuariosPage() {
  const { data, isLoading, isError } = useUsuarios();
  const desactivar = useDesactivarUsuario();

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<UsuarioOut | null>(null);
  const [aDesactivar, setADesactivar] = useState<UsuarioOut | null>(null);

  const usuarios = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Usuarios</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Gestión de usuarios y roles del sistema.
          </p>
        </div>
        <Button onClick={() => setCreando(true)}>Nuevo usuario</Button>
      </div>

      {isLoading ? (
        <div className="animate-pulse rounded-lg border border-border bg-surface p-8 text-center text-text-subtle">
          Cargando usuarios…
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-lg border border-neg-border bg-neg-bg p-8 text-center text-neg"
        >
          No se pudieron cargar los usuarios.
        </div>
      ) : usuarios.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-subtle">
          Todavía no hay usuarios.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken text-left text-text-muted">
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Roles</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-text">{u.nombre}</td>
                  <td className="px-4 py-2 text-text-muted">{u.email}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles ?? []).length === 0 ? (
                        <span className="text-text-subtle">—</span>
                      ) : (
                        (u.roles ?? []).map((r) => (
                          <Badge key={r} tone="info" className="capitalize">
                            {r}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={u.activo ? "success" : "default"}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditando(u)}>
                        Editar
                      </Button>
                      {u.activo && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setADesactivar(u)}
                        >
                          Desactivar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
