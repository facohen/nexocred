import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { RendicionPage } from "./RendicionPage";

type RendicionOut = components["schemas"]["RendicionOut"];

/** Resolves the cobrador's current rendición and renders its detail. */
export function RendicionRoute() {
  const q = useQuery({
    queryKey: ["rendiciones"],
    queryFn: () => apiFetch<{ data: RendicionOut[] }>("/rendiciones"),
  });
  const rendiciones = q.data?.data ?? [];
  const actual = rendiciones[0];

  if (q.isLoading) return <p className="p-4 text-sm text-text-muted">Cargando rendición…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-neg">No se pudo cargar la rendición.</p>;
  if (!actual) return <p className="p-4 text-sm text-text-muted">No hay rendiciones abiertas.</p>;
  return <RendicionPage rendicionId={actual.id} />;
}
