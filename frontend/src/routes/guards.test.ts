import { describe, it, expect } from "vitest";
import { redirect } from "@tanstack/react-router";
import { enforceRoles, ROUTE_ROLES, fallbackRoute } from "./guards";
import { setToken, clearToken, setSessionUser } from "@/lib/auth";

function loginAs(roles: ("admin" | "analista" | "cobrador" | "vendedor" | "operador" | "tesoreria")[]) {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ email: "x@nexocred.test", nombre: "x", roles });
}

describe("route guards", () => {
  it("redirects an unauthenticated user to /login", () => {
    clearToken();
    expect(() => enforceRoles(["admin"])).toThrow();
    try {
      enforceRoles(["admin"]);
    } catch (e) {
      expect(e).toEqual(redirect({ to: "/login" }));
    }
  });

  it("blocks a non-admin from /usuarios (admin-only)", () => {
    loginAs(["cobrador"]);
    expect(() => enforceRoles(ROUTE_ROLES["/usuarios"])).toThrow();
    clearToken();
  });

  it("allows an admin into /usuarios", () => {
    loginAs(["admin"]);
    expect(() => enforceRoles(ROUTE_ROLES["/usuarios"])).not.toThrow();
    clearToken();
  });

  it("blocks a cobrador from /caja (admin+tesoreria+operador)", () => {
    loginAs(["cobrador"]);
    expect(() => enforceRoles(ROUTE_ROLES["/caja"])).toThrow();
    clearToken();
  });

  it("allows a tesoreria user into /caja", () => {
    loginAs(["tesoreria"]);
    expect(() => enforceRoles(ROUTE_ROLES["/caja"])).not.toThrow();
    clearToken();
  });

  it("empty role set means any authenticated user passes", () => {
    loginAs(["cobrador"]);
    expect(() => enforceRoles([])).not.toThrow();
    clearToken();
  });

  // ---- F1c / F1d RBAC ----
  it("bloquea a un operador en La Ruta (solo cobrador/admin)", () => {
    loginAs(["operador"]);
    expect(() => enforceRoles(ROUTE_ROLES["/ruta"])).toThrow();
    clearToken();
  });

  it("permite a un cobrador en La Ruta", () => {
    loginAs(["cobrador"]);
    expect(() => enforceRoles(ROUTE_ROLES["/ruta"])).not.toThrow();
    clearToken();
  });

  it("bloquea a un cobrador en La Torre (admin/tesoreria)", () => {
    loginAs(["cobrador"]);
    expect(() => enforceRoles(ROUTE_ROLES["/torre"])).toThrow();
    clearToken();
  });

  it("bloquea a un vendedor en Tesorería", () => {
    loginAs(["vendedor"]);
    expect(() => enforceRoles(ROUTE_ROLES["/tesoreria"])).toThrow();
    clearToken();
  });

  it("permite a tesoreria en Tesorería y La Torre", () => {
    loginAs(["tesoreria"]);
    expect(() => enforceRoles(ROUTE_ROLES["/tesoreria"])).not.toThrow();
    expect(() => enforceRoles(ROUTE_ROLES["/torre"])).not.toThrow();
    clearToken();
  });

  it("bloquea a un cobrador en el CRM (operador/admin)", () => {
    loginAs(["cobrador"]);
    expect(() => enforceRoles(ROUTE_ROLES["/crm/inbox"])).toThrow();
    clearToken();
  });

  it("solo admin entra a asignaciones masivas", () => {
    loginAs(["operador"]);
    expect(() => enforceRoles(ROUTE_ROLES["/crm/asignaciones"])).toThrow();
    loginAs(["admin"]);
    expect(() => enforceRoles(ROUTE_ROLES["/crm/asignaciones"])).not.toThrow();
    clearToken();
  });

  it("toda ruta F1c/F1d nueva tiene roles definidos (no abierta por defecto)", () => {
    for (const path of [
      "/ruta", "/rendicion", "/crm/inbox", "/crm/incidentes", "/crm/asignaciones",
      "/crm/prospectos", "/riesgo/tablero", "/riesgo/alertas", "/vendedores/comisiones",
      "/vendedores/liquidaciones", "/tesoreria", "/torre", "/documentos",
    ]) {
      expect(ROUTE_ROLES[path]).toBeDefined();
      expect(ROUTE_ROLES[path].length).toBeGreaterThan(0);
    }
  });
});

// ── C8: fallbackRoute ──────────────────────────────────────────────────────

describe("fallbackRoute", () => {
  it("retorna /ruta para cobrador", () => {
    expect(fallbackRoute(["cobrador"])).toBe("/ruta");
  });

  it("retorna /tesoreria para tesoreria", () => {
    expect(fallbackRoute(["tesoreria"])).toBe("/tesoreria");
  });

  it("retorna /solicitudes para vendedor", () => {
    expect(fallbackRoute(["vendedor"])).toBe("/solicitudes");
  });

  it("retorna /crm/inbox para operador", () => {
    expect(fallbackRoute(["operador"])).toBe("/crm/inbox");
  });

  it("retorna /personas para analista", () => {
    expect(fallbackRoute(["analista"])).toBe("/personas");
  });

  it("retorna /personas para admin", () => {
    expect(fallbackRoute(["admin"])).toBe("/personas");
  });

  it("retorna /login para roles desconocidos", () => {
    expect(fallbackRoute([])).toBe("/login");
  });
});

describe("enforceRoles con fallbackRoute", () => {
  it("cobrador bloqueado de /personas redirige a /ruta no a /personas", () => {
    loginAs(["cobrador"]);
    try {
      enforceRoles(["analista", "admin"]);
      expect.fail("expected redirect");
    } catch (e) {
      expect(e).toEqual(redirect({ to: "/ruta" as string }));
    }
    clearToken();
  });
});
