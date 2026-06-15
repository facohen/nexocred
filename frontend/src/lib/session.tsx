import { useState, useCallback, type ReactNode } from "react";
import {
  SessionContext,
  getSessionUser,
  setToken,
  setSessionUser,
  clearToken,
  type SesionUsuario,
  type TokenSet,
} from "./auth";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SesionUsuario | null>(() => getSessionUser());

  const login = useCallback((token: TokenSet, sessionUser: SesionUsuario) => {
    setToken(token);
    setSessionUser(sessionUser);
    setUser(sessionUser);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    // Navegación explícita: el guard de ruta (beforeLoad) NO se re-ejecuta sin
    // una navegación, así que limpiar el token no basta para salir de la zona
    // protegida. Un full redirect (igual que el login en onSuccess) además
    // descarta todo el estado en memoria — React Query, memoryToken/memoryUser —
    // evitando que queden datos cacheados del usuario anterior.
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }, []);

  return (
    <SessionContext.Provider value={{ user, login, logout }}>{children}</SessionContext.Provider>
  );
}
