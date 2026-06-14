import { createContext, useContext } from "react";

export type Rol =
  | "admin"
  | "analista"
  | "cobrador"
  | "vendedor"
  | "operador"
  | "tesoreria";

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface SesionUsuario {
  email: string;
  nombre: string;
  roles: Rol[];
}

export const ROLES_CONOCIDOS: Rol[] = [
  "admin",
  "analista",
  "cobrador",
  "vendedor",
  "operador",
  "tesoreria",
];

// XSS tradeoff: keeping the token in localStorage is acceptable for this POC
// (no httpOnly cookie infra), but it means a successful XSS could exfiltrate it.
// In production the access token should live in an httpOnly, SameSite cookie.
const TOKEN_KEY = "nexocred.token";
const USER_KEY = "nexocred.user";

/** Base64url-decode the JWT payload segment. */
function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  if (typeof atob === "function") return atob(padded + pad);
  return Buffer.from(padded + pad, "base64").toString("binary");
}

/**
 * Decode the user's roles from the JWT access token claims.
 * Roles MUST come from the signed token, never from the email string — the
 * frontend does not (and cannot) self-assign roles. We do not verify the
 * signature here (that is the backend's job); we only read the claims that the
 * backend already validated when it issued/accepts the token.
 */
export function decodeRolesFromToken(accessToken: string | null | undefined): Rol[] {
  if (!accessToken) return [];
  const parts = accessToken.split(".");
  if (parts.length < 2) return [];
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { roles?: unknown };
    const raw = Array.isArray(payload.roles) ? payload.roles : [];
    return raw.filter((r): r is Rol => ROLES_CONOCIDOS.includes(r as Rol));
  } catch {
    return [];
  }
}

let memoryToken: TokenSet | null = null;
let memoryUser: SesionUsuario | null = null;

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function setToken(token: TokenSet): void {
  memoryToken = token;
  safeLocalStorage()?.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function getToken(): TokenSet | null {
  if (memoryToken) return memoryToken;
  const ls = safeLocalStorage();
  const raw = ls?.getItem(TOKEN_KEY);
  if (raw) {
    // localStorage corrupto (JSON inválido) NO debe crashear el beforeLoad de
    // cada ruta: limpiamos la clave y tratamos al usuario como deslogueado.
    try {
      memoryToken = JSON.parse(raw) as TokenSet;
      return memoryToken;
    } catch {
      ls?.removeItem(TOKEN_KEY);
      return null;
    }
  }
  return null;
}

export function clearToken(): void {
  memoryToken = null;
  memoryUser = null;
  const ls = safeLocalStorage();
  ls?.removeItem(TOKEN_KEY);
  ls?.removeItem(USER_KEY);
}

export function setSessionUser(user: SesionUsuario): void {
  memoryUser = user;
  safeLocalStorage()?.setItem(USER_KEY, JSON.stringify(user));
}

export function getSessionUser(): SesionUsuario | null {
  if (memoryUser) return memoryUser;
  const ls = safeLocalStorage();
  const raw = ls?.getItem(USER_KEY);
  if (raw) {
    try {
      memoryUser = JSON.parse(raw) as SesionUsuario;
      return memoryUser;
    } catch {
      ls?.removeItem(USER_KEY);
      return null;
    }
  }
  return null;
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export function hasRole(user: SesionUsuario | null, ...roles: Rol[]): boolean {
  if (!user) return false;
  return roles.some((r) => user.roles.includes(r));
}

export interface SessionContextValue {
  user: SesionUsuario | null;
  login: (token: TokenSet, user: SesionUsuario) => void;
  logout: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}
