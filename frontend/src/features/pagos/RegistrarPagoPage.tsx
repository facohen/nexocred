import { PagoForm } from "./PagoForm";

/** Ruta /pagos: registra un pago con el form embebido inline en la página. */
export function RegistrarPagoPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Registrar pago</h1>
      <PagoForm />
    </div>
  );
}
