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
  }, []);

  return (
    <SessionContext.Provider value={{ user, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}
