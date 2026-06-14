import type { SVGProps } from "react";

/**
 * Set de íconos de navegación, SVG inline (sin dependencias externas). Cada
 * clave corresponde a un área de trabajo (ver `WorkArea.icon` en lib/nav.ts).
 * Trazo coherente (1.6, currentColor) para que todos pesen igual visualmente.
 */
export type NavIconName =
  | "inbox"
  | "originar"
  | "evaluar"
  | "cobrar"
  | "cartera"
  | "relacion"
  | "riesgo"
  | "dinero"
  | "tablero"
  | "documentos"
  | "usuarios";

type IconProps = SVGProps<SVGSVGElement> & { name: NavIconName };

// Cada path se dibuja sobre un viewBox 24×24 con trazo currentColor.
const PATHS: Record<NavIconName, JSX.Element> = {
  inbox: (
    <>
      <path d="M3 12h5l2 3h4l2-3h5" />
      <path d="M5 6h14l2 6v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-6Z" />
    </>
  ),
  originar: (
    <>
      <path d="M14 3v5h5" />
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  evaluar: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  cobrar: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="m9 21 1.5-7L8 12l-2 3" />
      <path d="M13.5 14 15 21M10.5 8.5 14 10l3-1" />
    </>
  ),
  cartera: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
      <path d="M3 10h18M16 6V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v1" />
    </>
  ),
  relacion: (
    <>
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />
    </>
  ),
  riesgo: (
    <>
      <path d="M10.3 4 3 17a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  dinero: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.2A2.4 2.4 0 0 1 12 8c1.4 0 2.5.8 2.5 1.9M9.5 14.5A2.4 2.4 0 0 0 12 16c1.4 0 2.5-.8 2.5-1.9" />
    </>
  ),
  tablero: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </>
  ),
  documentos: (
    <>
      <path d="M14 3v5h5" />
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.3a3 3 0 0 1 0 5.4M21 20a6 6 0 0 0-4-5.6" />
    </>
  ),
};

export function NavIcon({ name, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
