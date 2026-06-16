import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePersonas } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkInboxHero } from "@/components/WorkInbox";
import { PersonaForm } from "./PersonaForm";
import type { components } from "@/lib/api/schema";

type Persona = components["schemas"]["PersonaListItem"];

// Debounce local del término de búsqueda: evita pegarle al backend en cada
// tecla. Sin dependencia externa; 300ms es suficiente para escritura humana.
function useTextoDebounced(valor: string, ms: number): string {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return debounced;
}

/**
 * "Mis clientes" del vendedor. El backend scopea GET /personas al vendedor
 * (su cartera = personas detrás de sus solicitudes/préstamos), así que esta
 * vista consume el listado real (sin derivar de solicitudes en el front).
 * Permite buscar por nombre (?nombre del backend), dar de alta un cliente
 * (PersonaForm) y abrir la ficha 360 (PersonaDetailPage).
 */
export function MisClientesPage() {
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState(false);
  const nombre = useTextoDebounced(busqueda.trim(), 300);

  // El vendedor recibe su cartera scopeada; `nombre` filtra en el backend.
  const personasQ = usePersonas({ nombre: nombre || undefined });
  const clientes = useMemo(() => personasQ.data?.data ?? [], [personasQ.data]);

  if (creando) {
    return (
      <div className="space-y-6">
        <WorkInboxHero
          title="Nuevo cliente"
          subtitle="Alta de un cliente para tu cartera."
          action={
            <Button variant="outline" onClick={() => setCreando(false)}>
              Volver
            </Button>
          }
        />
        <Card>
          <PersonaForm
            onCreated={(id) => {
              setCreando(false);
              navigate({ to: `/personas/${id}` as string });
            }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkInboxHero
        title="Mis clientes"
        subtitle="Tu cartera: buscá, abrí la ficha o sumá un cliente nuevo."
        action={<Button size="lg" onClick={() => setCreando(true)}>+ Nuevo cliente</Button>}
      />

      <Input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o apellido…"
        aria-label="Buscar clientes por nombre"
        className="max-w-sm"
      />

      {personasQ.isError ? (
        <p role="alert" className="text-sm text-neg">
          No se pudo cargar tu cartera de clientes.
        </p>
      ) : personasQ.isLoading ? (
        <p className="animate-pulse text-sm text-text-subtle">Cargando clientes…</p>
      ) : clientes.length === 0 ? (
        <Card>
          <CardTitle>{nombre ? "Sin coincidencias" : "Sin clientes todavía"}</CardTitle>
          <p className="text-sm text-text-subtle">
            {nombre
              ? "Ningún cliente coincide con la búsqueda."
              : "Dá de alta un cliente o originá una solicitud para sumar el primero."}
          </p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {clientes.map((c) => (
            <li key={c.id}>
              <ClienteCard
                cliente={c}
                onAbrir={() => navigate({ to: `/personas/${c.id}` as string })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClienteCard({ cliente, onAbrir }: { cliente: Persona; onAbrir: () => void }) {
  return (
    <button type="button" onClick={onAbrir} className="w-full rounded-lg text-left">
      <Card className="space-y-1 transition-colors hover:bg-surface-sunken">
        <CardTitle>
          {cliente.apellido}, {cliente.nombre}
        </CardTitle>
        <div className="text-sm text-text-muted">
          DNI {cliente.dni}
          {cliente.cuil ? ` · CUIL ${cliente.cuil}` : ""}
        </div>
      </Card>
    </button>
  );
}
