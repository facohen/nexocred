import { describe, it, expect } from "vitest";
import { redirect } from "@tanstack/react-router";
import { enforceRoles, ROUTE_ROLES } from "./guards";
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
});
