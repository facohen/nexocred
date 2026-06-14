import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Límite de error de la app: ante cualquier throw en el render (p.ej. un
 * formato de plata inesperado que escape a MoneyText, o un campo faltante en
 * datos reales del backend) muestra un mensaje recuperable en vez de la pantalla
 * blanca de React. "Reintentar" limpia el estado de error para re-montar el árbol.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // En producción esto iría a un colector de errores; en POC, a la consola.
    console.error("ErrorBoundary atrapó un error de render:", error, info);
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="m-4 rounded-lg border border-neg-border bg-neg-bg p-6 text-sm text-neg"
        >
          <h2 className="mb-2 text-base font-semibold">Algo salió mal</h2>
          <p className="mb-4 text-text-muted">
            Se produjo un error al mostrar esta pantalla. Tus datos están a salvo.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-text hover:bg-surface-sunken"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
