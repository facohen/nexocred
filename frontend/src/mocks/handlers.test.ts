import { describe, it, expect } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { clearToken } from "@/lib/auth";
import type { components } from "@/lib/api/schema";

type PersonaPagina = components["schemas"]["PersonaPagina"];
type TokenOut = components["schemas"]["TokenOut"];

describe("MSW handlers", () => {
  it("GET /personas devuelve la lista de fixtures", async () => {
    clearToken();
    const page = await apiFetch<PersonaPagina>("/personas");
    expect(page.total).toBeGreaterThan(0);
    expect(page.data.length).toBeGreaterThan(0);
    expect(typeof page.data[0].ingresos_totales).toBe("string");
  });

  it("POST /auth/login devuelve un token", async () => {
    const tok = await apiFetch<TokenOut>("/auth/login", {
      method: "POST",
      body: { email: "admin@nexocred.test", password: "secret" },
    });
    expect(tok.access_token).toBeTruthy();
    expect(tok.token_type).toBe("bearer");
  });

  it("GET /prestamos/:id/payoff devuelve montos como strings", async () => {
    const payoff = await apiFetch<components["schemas"]["PayoffOut"]>(
      "/prestamos/prestamo-1/payoff",
    );
    expect(typeof payoff.total).toBe("string");
    expect(typeof payoff.capital).toBe("string");
  });
});
