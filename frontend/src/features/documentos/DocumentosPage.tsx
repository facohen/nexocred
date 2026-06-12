import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/FormField";
import { useDocumentos, useGenerarDocumento, useAnularDocumento, descargarDocumento } from "./hooks";

const TIPOS = ["pagare", "contrato", "recibo", "constancia"];

/**
 * Documentos de un préstamo: listar (número + hash), generar (Idempotency-Key),
 * descargar (link) y anular (motivo). Los anulados quedan marcados.
 */
export function DocumentosPage({ prestamoId }: { prestamoId: string }) {
  const q = useDocumentos(prestamoId);
  const generar = useGenerarDocumento(prestamoId);
  const anular = useAnularDocumento(prestamoId);
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  if (q.isLoading) return <p className="p-4 text-sm text-foreground/60">Cargando documentos…</p>;
  if (q.isError) return <p role="alert" className="p-4 text-sm text-red-700">No se pudieron cargar los documentos.</p>;
  const documentos = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Documentos</h1>
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}

      <Card>
        <CardTitle>Generar documento</CardTitle>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label htmlFor="tipo-doc" className="text-sm font-medium">Tipo</label>
            <select
              id="tipo-doc"
              className="h-9 rounded-md border border-border bg-white px-2 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <Button
            onClick={async () => {
              await generar.mutateAsync(tipo);
              setAviso("Documento generado.");
            }}
            disabled={generar.isPending}
          >
            Generar documento
          </Button>
        </div>
      </Card>

      {documentos.length === 0 ? (
        <p className="text-sm text-foreground/60">Sin documentos.</p>
      ) : (
        <ul className="space-y-2">
          {documentos.map((d) => {
            const anulado = Boolean(d.anulado_en);
            return (
              <li key={d.id}>
                <Card className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {d.tipo} · N° {d.numero}{" "}
                        {anulado && <Badge tone="danger">anulado</Badge>}
                      </div>
                      <div className="font-mono text-xs text-foreground/50">{d.hash_sha256.slice(0, 16)}…</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const url = await descargarDocumento(d.id);
                          setAviso(`Descarga lista: ${url}`);
                        }}
                      >
                        Descargar
                      </Button>
                      {!anulado && (
                        <Button size="sm" variant="destructive" onClick={() => setAnulando(d.id)}>
                          Anular
                        </Button>
                      )}
                    </div>
                  </div>

                  {anulando === d.id && (
                    <div className="flex items-end gap-2">
                      <FormField label="Motivo" name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          await anular.mutateAsync({ id: d.id, motivo });
                          setAnulando(null);
                          setMotivo("");
                          setAviso("Documento anulado.");
                        }}
                        disabled={!motivo || anular.isPending}
                      >
                        Confirmar anulación
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
