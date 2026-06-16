import { describe, it, expect } from "vitest";
import { redirect } from "@tanstack/react-router";
import { enforceRoles, ROUTE_ROLES, fallbackRoute } from "./guards";
import { setToken, clearToken, setSessionUser, type Rol } from "@/lib/auth";

function loginAs(roles: Rol[]) {
  setToken({ access_token: "t", refresh_token: "r", token_type: "bearer" });
  setSessionUser({ email: "x@nexocred.test", nombre: "x", roles });
}

describe("route guards", () => {
  it("redirects an unauthenticated user to /login", () => {
    clearToken();
    expect(() => enforceRoles(["admin_sistema"])).toThrow();
    try {
      enforceRoles(["admin_sistema"]);
    } catch (e) {
      expect(e).toEqual(redirect({ to: "/login" }));
    }
  });

  it("blocks a non-admin_sistema from /usuarios (admin_sistema-only)", () => {
    loginAs(["administrativo"]);
    expect(() => enforceRoles(ROUTE_ROLES["/usuarios"])).toThrow();
    clearToken();
  });

  it("allows an admin_sistema into /usuarios", () => {
    loginAs(["admin_sistema"]);
    expect(() => enforceRoles(ROUTE_ROLES["/usuarios"])).not.toThrow();
    clearToken();
  });

  it("blocks a vendedor from /caja (administrativo-only)", () => {
    loginAs(["vendedor"]);
    expect(() => enforceRoles(ROUTE_ROLES["/caja"])).toThrow();
    clearToken();
  });

  it("allows an administrativo user into /caja", () => {
    loginAs(["administrativo"]);
    expect(() => enforceRoles(ROUTE_ROLES["/caja"])).not.toThrow();
    clearToken();
  });

  it("empty role set means any authenticated user passes", () => {
    loginAs(["administrativo"]);
    expect(() => enforceRoles([])).not.toThrow();
    clearToken();
  });

  // ---- F1c / F1d RBAC ----
  it("bloquea a un vendedor en La Ruta (solo administrativo)", () => {
    loginAs(["vendedor"]);
    expect(() => enforceRoles(ROUTE_ROLES["/ruta"])).toThrow();
    clearToken();
  });

  it("permite a un administrativo en La Ruta", () => {
    loginAs(["administrativo"]);
    expect(() => enforceRoles(ROUTE_ROLES["/ruta"])).not.toThrow();
    clearToken();
  });

  it("bloquea a un vendedor en La Torre (ceo/administrativo)", () => {
    loginAs(["vendedor"]);
    expect(() => enforceRoles(ROUTE_ROLES["/torre"])).toThrow();
    clearToken();
  });

  it("bloquea a un vendedor en Tesorería", () => {
    loginAs(["vendedor"]);
    expect(() => enforceRoles(ROUTE_ROLES["/tesoreria"])).toThrow();
    clearToken();
  });

  it("permite a administrativo en Tesorería y La Torre", () => {
    loginAs(["administrativo"]);
    expect(() => enforceRoles(ROUTE_ROLES["/tesoreria"])).not.toThrow();
    expect(() => enforceRoles(ROUTE_ROLES["/torre"])).not.toThrow();
    clearToken();
  });

  it("permite al ceo en La Torre", () => {
    loginAs(["ceo"]);
    expect(() => enforceRoles(ROUTE_ROLES["/torre"])).not.toThrow();
    clearToken();
  });

  it("bloquea a un analista_riesgo en el CRM (vendedor/administrativo)", () => {
    loginAs(["analista_riesgo"]);
    expect(() => enforceRoles(ROUTE_ROLES["/crm/inbox"])).toThrow();
    clearToken();
  });

  it("solo administrativo entra a asignaciones masivas", () => {
    loginAs(["vendedor"]);
    expect(() => enforceRoles(ROUTE_ROLES["/crm/asignaciones"])).toThrow();
    loginAs(["administrativo"]);
    expect(() => enforceRoles(ROUTE_ROLES["/crm/asignaciones"])).not.toThrow();
    clearToken();
  });

  it("toda ruta F1c/F1d nueva tiene roles definidos (no abierta por defecto)", () => {
    for (const path of [
      "/ruta",
      "/rendicion",
      "/crm/inbox",
      "/crm/incidentes",
      "/crm/asignaciones",
      "/crm/prospectos",
      "/riesgo/tablero",
      "/riesgo/alertas",
      "/vendedores/comisiones",
      "/vendedores/liquidaciones",
      "/tesoreria",
      "/torre",
      "/documentos",
    ]) {
      expect(ROUTE_ROLES[path]).toBeDefined();
      expect(ROUTE_ROLES[path].length).toBeGreaterThan(0);
    }
  });
});

// ── C8: fallbackRoute ──────────────────────────────────────────────────────

describe("fallbackRoute", () => {
  it("retorna /bandeja para administrativo", () => {
    expect(fallbackRoute(["administrativo"])).toBe("/bandeja");
  });

  it("retorna /usuarios para admin_sistema", () => {
    expect(fallbackRoute(["admin_sistema"])).toBe("/usuarios");
  });

  it("retorna /vendedor (Inicio: dashboard de performance) para vendedor", () => {
    expect(fallbackRoute(["vendedor"])).toBe("/vendedor");
  });

  it("retorna /evaluacion (cola de evaluación) para analista_riesgo", () => {
    expect(fallbackRoute(["analista_riesgo"])).toBe("/evaluacion");
  });

  it("retorna /torre (Tablero Ejecutivo) para ceo", () => {
    expect(fallbackRoute(["ceo"])).toBe("/torre");
  });

  it("retorna /login para roles desconocidos", () => {
    expect(fallbackRoute([])).toBe("/login");
  });
});

describe("enforceRoles con fallbackRoute", () => {
  it("administrativo bloqueado de /evaluacion redirige a /bandeja no a /evaluacion", () => {
    loginAs(["administrativo"]);
    try {
      enforceRoles(["analista_riesgo"]);
      expect.fail("expected redirect");
    } catch (e) {
      expect(e).toEqual(redirect({ to: "/bandeja" as string }));
    }
    clearToken();
  });
});
