import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { apiFetch, ApiError } from "./client";
import { setToken, clearToken } from "@/lib/auth";

const BASE = "http://localhost/api/v1";

describe("apiFetch", () => {
  beforeEach(() => clearToken());

  it("envia el header Authorization cuando hay token", async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BASE}/ping`, ({ request }) => {
        seen = request.headers.get("Authorization");
        return HttpResponse.json({ ok: true });
      }),
    );
    setToken({ access_token: "tok-123", refresh_token: "r", token_type: "bearer" });
    await apiFetch("/ping");
    expect(seen).toBe("Bearer tok-123");
  });

  it("pasa montos como strings sin convertirlos a number", async () => {
    server.use(
      http.get(`${BASE}/saldo`, () => HttpResponse.json({ monto: "14500.00" })),
    );
    const data = await apiFetch<{ monto: string }>("/saldo");
    expect(data.monto).toBe("14500.00");
    expect(typeof data.monto).toBe("string");
  });

  it("convierte el sobre de error {error:{code,message}} en ApiError", async () => {
    server.use(
      http.post(`${BASE}/personas`, () =>
        HttpResponse.json(
          { error: { code: "cuil_duplicado", message: "El CUIL ya existe" } },
          { status: 409 },
        ),
      ),
    );
    await expect(apiFetch("/personas", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "cuil_duplicado",
      message: "El CUIL ya existe",
    });
    await expect(apiFetch("/personas", { method: "POST", body: {} })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("expone los details de validación por campo en el ApiError", async () => {
    server.use(
      http.post(`${BASE}/personas`, () =>
        HttpResponse.json(
          {
            error: {
              code: "validacion",
              message: "Datos inválidos",
              details: { cuil: "dígito verificador incorrecto" },
            },
          },
          { status: 422 },
        ),
      ),
    );
    await expect(apiFetch("/personas", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "validacion",
      details: { cuil: "dígito verificador incorrecto" },
    });
  });

  it("reenvia el header Idempotency-Key", async () => {
    let seen: string | null = null;
    server.use(
      http.post(`${BASE}/pagos`, ({ request }) => {
        seen = request.headers.get("Idempotency-Key");
        return HttpResponse.json({ id: "p1" });
      }),
    );
    await apiFetch("/pagos", { method: "POST", body: {}, idempotencyKey: "key-abc" });
    expect(seen).toBe("key-abc");
  });
});
