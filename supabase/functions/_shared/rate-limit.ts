type RateLimitAdmin = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): unknown;
};

export type RateLimitOptions = {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
};

export class RateLimitExceededError extends Error {
  readonly resetAt?: string;

  constructor(resetAt?: string) {
    super("Rate limit exceeded. Try again later.");
    this.name = "RateLimitExceededError";
    this.resetAt = resetAt;
  }
}

export async function enforceRateLimit(admin: RateLimitAdmin, options: RateLimitOptions) {
  const { data, error } = await admin.rpc("consume_edge_rate_limit", {
    p_scope: options.scope,
    p_key: options.key,
    p_limit_count: options.limit,
    p_window_seconds: options.windowSeconds,
  }) as { data: Array<{ allowed: boolean; remaining: number; reset_at: string }> | null; error: Error | null };
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error("Rate limit check failed");
  if (!result.allowed) throw new RateLimitExceededError(result.reset_at);
  return result;
}

export function requestIpKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip")?.trim() ||
    forwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown-ip";
}

export function normalizeRateLimitKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function envInt(name: string, fallback: number) {
  const raw = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env?.get(name);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
