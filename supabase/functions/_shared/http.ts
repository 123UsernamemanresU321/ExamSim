export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-safeexambrowser-requesthash, x-safeexambrowser-configkeyhash, x-safeexambrowser-browserexamkeyhash",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function text(message: string, status = 200) {
  return new Response(message, {
    status,
    headers: { ...corsHeaders, "content-type": "text/plain" },
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
  if (request.method === "OPTIONS") return text("ok");
  return null;
}

export function errorResponse(error: unknown, fallback = "Edge Function request failed") {
  const message = error instanceof Error ? error.message : fallback;
  return json({ error: message }, statusForError(message));
}

export function statusForError(message: string) {
  if (/missing bearer token|invalid bearer token|invalid jwt|jwt expired|auth session missing/i.test(message)) return 401;
  if (/MFA|AAL2|owner role required|student role required|forbidden|unauthorized/i.test(message)) return 403;
  if (/already has a file|already activated|published assessment versions are immutable/i.test(message)) return 409;
  if (/not configured|misconfigured/i.test(message)) return 500;
  if (/DeepSeek|MinerU|KMS|provider|gateway|timed out/i.test(message)) return 502;
  if (/required|missing|invalid|must be|not allowed|not available|not enabled|does not match|expired|review is required|not submitted|not found/i.test(message)) return 400;
  return 500;
}
