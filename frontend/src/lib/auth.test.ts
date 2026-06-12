import { describe, it, expect } from "vitest";
import { decodeRolesFromToken, hasRole, type SesionUsuario } from "./auth";

/** Build a JWT-shaped token (header.payload.signature) with the given claims. */
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

describe("decodeRolesFromToken", () => {
  it("reads roles from the JWT claims, NOT from the email", () => {
    // email contains 'admin' but the token only grants 'cobrador'
    const token = makeJwt({ sub: "admin.persona@nexocred.test", roles: ["cobrador"] });
    expect(decodeRolesFromToken(token)).toEqual(["cobrador"]);
  });

  it("returns empty roles for a malformed token", () => {
    expect(decodeRolesFromToken("not-a-jwt")).toEqual([]);
    expect(decodeRolesFromToken("")).toEqual([]);
  });

  it("ignores unknown role strings in the claims", () => {
    const token = makeJwt({ roles: ["admin", "superuser", "cobrador"] });
    expect(decodeRolesFromToken(token)).toEqual(["admin", "cobrador"]);
  });
});

describe("hasRole", () => {
  it("a cobrador session does NOT have admin even if email contains 'admin'", () => {
    const user: SesionUsuario = {
      email: "admin.lookalike@nexocred.test",
      nombre: "x",
      roles: ["cobrador"],
    };
    expect(hasRole(user, "admin")).toBe(false);
    expect(hasRole(user, "cobrador")).toBe(true);
  });

  it("returns false for a null user", () => {
    expect(hasRole(null, "admin")).toBe(false);
  });
});
