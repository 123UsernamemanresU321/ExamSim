const DEFAULT_ALLOWED_ORIGINS = [
  "https://examvault.tutor-mcp.com",
  "https://exam-vault-zeta.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const baseCorsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-safeexambrowser-requesthash, x-safeexambrowser-configkeyhash, x-safeexambrowser-browserexamkeyhash, x-exam-vault-timestamp, x-exam-vault-delivery-id, x-exam-vault-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function configuredAllowedOrigins() {
  const env = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env?.get("APP_ALLOWED_ORIGINS");
  const configured = env?.split(",").map(normalizeOrigin).filter(Boolean) ?? [];
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function isCorsOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return configuredAllowedOrigins().includes(origin);
}

export function corsHeadersFor(request?: Request) {
  const headers: Record<string, string> = { ...baseCorsHeaders };
  const allowed = configuredAllowedOrigins();
  const origin = request?.headers.get("origin");
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (!origin && allowed[0]) {
    // Backward-compatible fallback for older call sites and server-to-server calls.
    // Browser preflight still uses handleOptions(request), which fails closed for unknown origins.
    headers["Access-Control-Allow-Origin"] = allowed[0];
  }
  return headers;
}

export const corsHeaders = corsHeadersFor();

export function json(request: Request, data: unknown, status?: number): Response;
export function json(data: unknown, status?: number): Response;
export function json(requestOrData: Request | unknown, dataOrStatus?: unknown, maybeStatus?: number) {
  const request = requestOrData instanceof Request ? requestOrData : undefined;
  const data = request ? dataOrStatus : requestOrData;
  const status = request ? (maybeStatus ?? 200) : (typeof dataOrStatus === "number" ? dataOrStatus : 200);
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeadersFor(request), "content-type": "application/json" },
  });
}

export function text(request: Request, message: string, status?: number): Response;
export function text(message: string, status?: number): Response;
export function text(requestOrMessage: Request | string, messageOrStatus?: string | number, maybeStatus?: number) {
  const request = requestOrMessage instanceof Request ? requestOrMessage : undefined;
  const message = request ? String(messageOrStatus ?? "") : String(requestOrMessage);
  const status = request ? (maybeStatus ?? 200) : (typeof messageOrStatus === "number" ? messageOrStatus : 200);
  return new Response(message, {
    status,
    headers: { ...corsHeadersFor(request), "content-type": "text/plain" },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function handleOptions(request: Request) {
  if (request.method !== "OPTIONS") return null;
  if (!isCorsOriginAllowed(request)) return text(request, "Forbidden", 403);
  return text(request, "ok");
}

export function errorResponse(request: Request, error: unknown, fallback?: string): Response;
export function errorResponse(error: unknown, fallback?: string): Response;
export function errorResponse(requestOrError: Request | unknown, errorOrFallback?: unknown, maybeFallback?: string) {
  const request = requestOrError instanceof Request ? requestOrError : undefined;
  const error = request ? errorOrFallback : requestOrError;
  const fallback = request ? (maybeFallback ?? "Edge Function request failed") : (typeof errorOrFallback === "string" ? errorOrFallback : "Edge Function request failed");
  const message = error instanceof Error ? error.message : fallback;
  const status = statusForError(message);
  return request ? json(request, { error: message }, status) : json({ error: message }, status);
}

export function statusForError(message: string) {
  if (/missing bearer token|invalid bearer token|invalid jwt|jwt expired|auth session missing/i.test(message)) return 401;
  if (/MFA|AAL2|owner role required|student role required|forbidden|unauthorized/i.test(message)) return 403;
  if (/rate limit|monthly usage limit|too many/i.test(message)) return 429;
  if (/already has a file|already activated|published assessment versions are immutable/i.test(message)) return 409;
  if (/not configured|misconfigured/i.test(message)) return 500;
  if (/AI response failed backend validation|AI response was not valid JSON|AI response JSON|AI response missing normalized_package|DeepSeek did not return message content/i.test(message)) return 422;
  if (/DeepSeek|MinerU|KMS|provider|gateway|timed out/i.test(message)) return 502;
  if (/required|missing|invalid|must be|not allowed|not available|not enabled|does not match|expired|review is required|not submitted|not found/i.test(message)) return 400;
  return 500;
}
