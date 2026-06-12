import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { makeWrapper } from "@/test/utils";
import { useAccionSolicitud } from "@/lib/api/queries";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({}),
}));

const BASE = "http://localhost/api/v1";

describe("useAccionSolicitud · Idempotency-Key", () => {
  it("envia Idempotency-Key al desembolsar (accion money-creating)", async () => {
    let seenKey: string | null = null;
    server.use(
      http.post(`${BASE}/solicitudes/:id/desembolsar`, ({ request }) => {
        seenKey = request.headers.get("Idempotency-Key");
        return HttpResponse.json({ id: "prestamo-x" });
      }),
    );
    const { result } = renderHook(() => useAccionSolicitud("solicitud-1"), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ accion: "desembolsar" });
    await waitFor(() => expect(seenKey).toBeTruthy());
  });

  it("NO envia Idempotency-Key al evaluar (accion idempotente de solo lectura)", async () => {
    let hadKey = true;
    server.use(
      http.post(`${BASE}/solicitudes/:id/evaluar`, ({ request }) => {
        hadKey = request.headers.has("Idempotency-Key");
        return HttpResponse.json({ id: "solicitud-1", estado: "evaluada" });
      }),
    );
    const { result } = renderHook(() => useAccionSolicitud("solicitud-1"), {
      wrapper: makeWrapper(),
    });
    result.current.mutate({ accion: "evaluar" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(hadKey).toBe(false);
  });

  it("re-desembolsar el mismo intento reusa la misma key", async () => {
    const keys: (string | null)[] = [];
    server.use(
      http.post(`${BASE}/solicitudes/:id/desembolsar`, ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key"));
        return HttpResponse.json({ id: "prestamo-x" });
      }),
    );
    const { result } = renderHook(() => useAccionSolicitud("solicitud-1"), {
      wrapper: makeWrapper(),
    });
    const key = "fixed-intent-key";
    result.current.mutate({ accion: "desembolsar", idempotencyKey: key });
    await waitFor(() => expect(keys.length).toBe(1));
    result.current.mutate({ accion: "desembolsar", idempotencyKey: key });
    await waitFor(() => expect(keys.length).toBe(2));
    expect(keys[0]).toBe(key);
    expect(keys[1]).toBe(key);
  });
});
