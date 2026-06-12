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

const TOKEN_KEY = "nexocred.token";
const USER_KEY = "nexocred.user";

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
  const raw = safeLocalStorage()?.getItem(TOKEN_KEY);
  if (raw) {
    memoryToken = JSON.parse(raw) as TokenSet;
    return memoryToken;
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
  const raw = safeLocalStorage()?.getItem(USER_KEY);
  if (raw) {
    memoryUser = JSON.parse(raw) as SesionUsuario;
    return memoryUser;
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
