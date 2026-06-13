// Cliente API type-safe sobre openapi-fetch + el schema generado.
//
// Preserva la lógica probada de client.ts (auth bearer, Idempotency-Key,
// auto-logout en 401, envelope {error:{code,message}} -> ApiError) como
// middleware, sumando type-safety end-to-end derivada de openapi.json.
//
// Money se pasa verbatim como string (el schema lo tipa como string); nunca
// se parsea a Number.

import createClient, { type Middleware } from "openapi-fetch";
import createReactQueryClient from "openapi-react-query";

import { clearToken, getToken } from "@/lib/auth";
import { ApiError, type ApiErrorEnvelope } from "@/lib/api/client";
import type { paths } from "@/lib/api/schema";

// URL relativa (igual que client.ts): el browser la resuelve contra el origen
// actual; Vite proxy (dev) / nginx (prod) reenvían /api/*. En tests MSW matchea
// el path relativo sin importar el origen jsdom. Nunca hardcodear host:puerto.
const BASE_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ??
  "/api/v1";

/** Inyecta Authorization bearer cuando hay token. */
const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getToken();
    if (token) request.headers.set("Authorization", `Bearer ${token.access_token}`);
    return request;
  },
  onResponse({ response }) {
    // Auto-logout: un 401 invalida la sesión local (igual que client.ts).
    if (response.status === 401) clearToken();
    return response;
  },
};

export const apiClient = createClient<paths>({
  baseUrl: BASE_URL,
  headers: { Accept: "application/json" },
});
apiClient.use(authMiddleware);

/** Hooks tipados de React Query para GETs triviales (lectura). */
export const api = createReactQueryClient(apiClient);

/**
 * Convierte el `{ data, error }` de openapi-fetch en el patrón clásico:
 * devuelve `data` o lanza un `ApiError` con el envelope del backend. Para usar
 * en mutaciones (React Query espera que la mutationFn lance en error).
 *
 * `response` permite leer el status real para distinguir rechazo de negocio
 * (422/409) de fallo de red.
 */
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.error !== undefined || !result.response.ok) {
    const env = result.error as Partial<ApiErrorEnvelope> | undefined;
    if (env?.error?.code) {
      throw new ApiError(
        env.error.code,
        env.error.message,
        result.response.status,
        env.error.details,
      );
    }
    throw new ApiError("error_desconocido", `Error ${result.response.status}`, result.response.status);
  }
  return result.data as T;
}

/**
 * Genera la `Idempotency-Key` para una operación financiera. Debe llamarse UNA
 * vez por intento (al abrir el form), y el retry tras error reusa la misma key
 * para que el backend deduplique. Ver plan §5.7.
 */
export function idempotencyHeader(key: string): { "Idempotency-Key": string } {
  return { "Idempotency-Key": key };
}
