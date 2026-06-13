import { getToken, clearToken } from "@/lib/auth";

/** Optional field-level validation details, e.g. { cuil: "dígito incorrecto" }. */
export type ApiErrorDetails = Record<string, unknown>;

export interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: ApiErrorDetails };
}

export class ApiError extends Error {
  code: string;
  status: number;
  /** Optional per-field validation details, surfaced into forms. */
  details?: ApiErrorDetails;
  constructor(code: string, message: string, status: number, details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

// URL relativa: el browser la resuelve contra el origen actual.
// En dev (Vite) el proxy reenvía /api/* → localhost:8001; en prod nginx hace
// lo mismo. En tests MSW matchea el path relativo sin importar el origen jsdom.
// Nunca hardcodear host:puerto.
const BASE_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ??
  "/api/v1";

function buildUrl(path: string, query?: ApiFetchOptions["query"]): string {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Typed fetch wrapper.
 * - Adds the bearer Authorization header when a token is present.
 * - Adds an Idempotency-Key header when provided.
 * - Parses the `{error:{code,message}}` envelope into a typed ApiError.
 * - Passes JSON through verbatim — money fields remain strings (never parsed
 *   to Number).
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token.access_token}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
  });

  if (res.status === 401) {
    clearToken();
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const env = data as Partial<ApiErrorEnvelope> | undefined;
    if (env?.error?.code) {
      throw new ApiError(env.error.code, env.error.message, res.status, env.error.details);
    }
    throw new ApiError(
      "error_desconocido",
      `Error ${res.status}`,
      res.status,
    );
  }

  return data as T;
}
