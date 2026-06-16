import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TransactionButton } from "@/components/TransactionButton";
import { FormField } from "@/components/FormField";
import {
  useDocumentos,
  useGenerarDocumento,
  useAnularDocumento,
  descargarDocumento,
} from "./hooks";
import type { components } from "@/lib/api/schema";

type Documento = components["schemas"]["DocumentoOut"];

const MONO = { fontFamily: "'Geist Mono', monospace" } as const;

const TIPOS = ["pagare", "contrato", "recibo", "constancia"] as const;
type Tipo = (typeof TIPOS)[number];

// Glifo + etiqueta por tipo de documento. Emoji unicode, sin paquetes nuevos.
const TIPO_META: Record<string, { glyph: string; label: string }> = {
  pagare: { glyph: "✍️", label: "Pagaré" },
  contrato: { glyph: "📜", label: "Contrato" },
  recibo: { glyph: "🧾", label: "Recibo" },
  constancia: { glyph: "📋", label: "Constancia" },
};

function tipoMeta(tipo: string) {
  return TIPO_META[tipo] ?? { glyph: "📄", label: tipo };
}

// ─── Date formatting ──────────────────────────────────────────────────────────

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function FilesIcon({ className }: { className?: string }) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  );
}

// ─── Status pill (semantic tokens) ────────────────────────────────────────────

function EstadoPill({ anulado }: { anulado: boolean }) {
  if (anulado) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{
          background: "hsl(var(--neg-bg))",
          color: "hsl(var(--neg))",
          border: "1px solid hsl(var(--neg-border))",
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(var(--neg))" }} />
        Anulado
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        background: "hsl(var(--pos-bg))",
        color: "hsl(var(--pos))",
        border: "1px solid hsl(var(--pos-border))",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(var(--pos))" }} />
      Vigente
    </span>
  );
}

// ─── Loading / error / empty states ───────────────────────────────────────────

function SkeletonDocs() {
  return (
    <div className="space-y-2.5" aria-busy="true" role="status">
      <span className="sr-only">Cargando documentos…</span>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <div
            className="h-10 w-10 shrink-0 animate-pulse rounded-lg"
            style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 80}ms` }}
          />
          <div className="flex flex-1 flex-col gap-2">
            <div
              className="h-3.5 w-40 animate-pulse rounded-md"
              style={{ background: "hsl(var(--surface-sunken))", animationDelay: `${i * 80}ms` }}
            />
            <div
              className="h-2.5 w-56 animate-pulse rounded-md"
              style={{
                background: "hsl(var(--surface-sunken))",
                animationDelay: `${i * 80 + 40}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyDocs() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center"
      style={{ borderColor: "hsl(var(--border-strong))" }}
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: "hsl(var(--brand-subtle))",
          boxShadow: "0 0 0 6px hsl(var(--brand) / 0.06)",
        }}
      >
        <FilesIcon className="h-6 w-6 text-brand" />
      </div>
      <p className="text-base font-semibold text-text">Sin documentos todavía</p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-muted">
        Generá el primer documento del préstamo —pagaré, contrato, recibo o constancia— desde el
        panel de arriba.
      </p>
    </div>
  );
}

// ─── Generate panel ───────────────────────────────────────────────────────────

function GenerarPanel({
  tipo,
  onTipo,
  onGenerar,
  pending,
}: {
  tipo: Tipo;
  onTipo: (t: Tipo) => void;
  onGenerar: () => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Generar documento</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Emite una pieza numerada y firmada con hash. Idempotente ante reintentos.
          </p>
        </div>
      </div>

      {/* Selector como pill-toggles, no un <select> plano */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {TIPOS.map((t) => {
          const meta = tipoMeta(t);
          const active = tipo === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTipo(t)}
              aria-pressed={active}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-150 hover:-translate-y-0.5"
              style={{
                borderColor: active ? "hsl(var(--brand-border))" : "hsl(var(--border))",
                background: active ? "hsl(var(--brand-subtle))" : "hsl(var(--surface))",
                color: active ? "hsl(var(--brand))" : "hsl(var(--text-muted))",
              }}
            >
              <span aria-hidden="true">{meta.glyph}</span>
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="text-xs text-text-subtle">
          {tipoMeta(tipo).glyph} {tipoMeta(tipo).label}
        </span>
        <TransactionButton onClick={onGenerar} pending={pending}>
          {pending ? "Generando…" : "Generar documento"}
        </TransactionButton>
      </div>
    </div>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────

function DocumentoRow({
  doc,
  anulandoId,
  motivo,
  onMotivo,
  onPedirAnular,
  onConfirmarAnular,
  onCancelarAnular,
  onDescargar,
  anulando,
}: {
  doc: Documento;
  anulandoId: string | null;
  motivo: string;
  onMotivo: (v: string) => void;
  onPedirAnular: () => void;
  onConfirmarAnular: () => void;
  onCancelarAnular: () => void;
  onDescargar: () => void;
  anulando: boolean;
}) {
  const anulado = Boolean(doc.anulado_en);
  const meta = tipoMeta(doc.tipo);
  const expandido = anulandoId === doc.id;

  return (
    <div
      className="rounded-xl border bg-surface p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{
        borderColor: anulado ? "hsl(var(--neg-border))" : "hsl(var(--border))",
        opacity: anulado ? 0.85 : 1,
      }}
    >
      <div className="flex items-start gap-3.5">
        {/* Glifo de tipo */}
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg"
          style={{
            background: "hsl(var(--surface-sunken))",
            border: "1px solid hsl(var(--border))",
          }}
          aria-hidden="true"
        >
          {meta.glyph}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-text">{meta.label}</span>
            <Badge tone="default" className="shrink-0">
              <span style={MONO}>N° {doc.numero}</span>
            </Badge>
            <EstadoPill anulado={anulado} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-subtle">
            <span style={MONO}>{doc.hash_sha256.slice(0, 16)}…</span>
            {anulado && (
              <span style={MONO} title="Fecha de anulación">
                baja {formatFecha(doc.anulado_en)}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={onDescargar} className="gap-1.5">
            <DownloadIcon className="h-3.5 w-3.5" />
            Descargar
          </Button>
          {!anulado && (
            <Button size="sm" variant="ghost" onClick={onPedirAnular} className="text-neg">
              Anular
            </Button>
          )}
        </div>
      </div>

      {expandido && (
        <div
          className="mt-3 rounded-lg border p-3"
          style={{ borderColor: "hsl(var(--neg-border))", background: "hsl(var(--neg-bg) / 0.4)" }}
        >
          <p className="mb-2 text-xs font-medium" style={{ color: "hsl(var(--neg))" }}>
            Anular el documento N° {doc.numero} es irreversible. Indicá el motivo.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <FormField
                label="Motivo"
                name="motivo"
                value={motivo}
                onChange={(e) => onMotivo(e.target.value)}
              />
            </div>
            <Button size="sm" variant="ghost" onClick={onCancelarAnular}>
              Cancelar
            </Button>
            <TransactionButton
              size="sm"
              variant="destructive"
              onClick={onConfirmarAnular}
              pending={anulando}
              disabled={!motivo || anulando}
            >
              Confirmar anulación
            </TransactionButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Documentos de un préstamo: listar (número + hash), generar (Idempotency-Key),
 * descargar (link) y anular (motivo). Los anulados quedan marcados. Conserva los
 * hooks (useDocumentos / useGenerarDocumento / useAnularDocumento / descargar)
 * y el prop prestamoId; solo cambia la capa visual.
 */
export function DocumentosPage({ prestamoId }: { prestamoId: string }) {
  const q = useDocumentos(prestamoId);
  const generar = useGenerarDocumento(prestamoId);
  const anular = useAnularDocumento(prestamoId);
  const [tipo, setTipo] = useState<Tipo>(TIPOS[0]);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const documentos = q.data?.data ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-text"
            style={{ letterSpacing: "-0.02em" }}
          >
            Documentos
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Piezas legales del préstamo. Cada una lleva número y hash verificable.
          </p>
        </div>
        {!q.isLoading && !q.isError && documentos.length > 0 && (
          <span
            className="mt-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-text-muted"
            style={{ background: "hsl(var(--surface-sunken))", ...MONO }}
          >
            {documentos.length} {documentos.length === 1 ? "doc" : "docs"}
          </span>
        )}
      </header>

      {aviso && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "hsl(var(--pos-border))",
            background: "hsl(var(--pos-bg))",
            color: "hsl(var(--pos))",
          }}
        >
          <span aria-hidden="true">✓</span>
          <span className="min-w-0 break-all">{aviso}</span>
        </div>
      )}

      <GenerarPanel
        tipo={tipo}
        onTipo={setTipo}
        pending={generar.isPending}
        onGenerar={async () => {
          await generar.mutateAsync(tipo);
          setAviso("Documento generado.");
        }}
      />

      {q.isLoading ? (
        <SkeletonDocs />
      ) : q.isError ? (
        <div
          role="alert"
          className="rounded-xl border px-5 py-8 text-center"
          style={{ borderColor: "hsl(var(--neg-border))", background: "hsl(var(--neg-bg))" }}
        >
          <p className="text-sm font-semibold" style={{ color: "hsl(var(--neg))" }}>
            No se pudieron cargar los documentos
          </p>
        </div>
      ) : documentos.length === 0 ? (
        <EmptyDocs />
      ) : (
        <div className="space-y-2.5">
          {documentos.map((d) => (
            <DocumentoRow
              key={d.id}
              doc={d}
              anulandoId={anulando}
              motivo={motivo}
              anulando={anular.isPending}
              onMotivo={setMotivo}
              onPedirAnular={() => {
                setAnulando(d.id);
                setMotivo("");
              }}
              onCancelarAnular={() => {
                setAnulando(null);
                setMotivo("");
              }}
              onConfirmarAnular={async () => {
                await anular.mutateAsync({ id: d.id, motivo });
                setAnulando(null);
                setMotivo("");
                setAviso("Documento anulado.");
              }}
              onDescargar={async () => {
                const url = await descargarDocumento(d.id);
                setAviso(`Descarga lista: ${url}`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
