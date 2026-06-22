type ProviderQuotaAdmin = {
  rpc(fn: string, args: Record<string, unknown>): unknown;
};

export type ProviderQuotaOptions = {
  ownerProfileId: string;
  provider: "deepseek" | "mineru" | "simpletex";
  unit: "usd" | "page";
  units: number;
  limit: number;
};

export class ProviderMonthlyQuotaExceededError extends Error {
  readonly resetAt?: string;

  constructor(provider: string, resetAt?: string) {
    super(`${provider} monthly usage limit reached. Use the manual fallback or wait for the monthly reset.`);
    this.name = "ProviderMonthlyQuotaExceededError";
    this.resetAt = resetAt;
  }
}

export async function enforceProviderMonthlyQuota(admin: ProviderQuotaAdmin, options: ProviderQuotaOptions) {
  if (!Number.isFinite(options.units) || options.units <= 0) throw new Error("Provider quota usage must be positive");
  if (!Number.isFinite(options.limit) || options.limit <= 0) throw new Error("Provider quota limit must be positive");

  const { data, error } = await admin.rpc("consume_provider_monthly_quota", {
    p_owner_profile_id: options.ownerProfileId,
    p_provider: options.provider,
    p_unit: options.unit,
    p_units: options.units,
    p_limit_amount: options.limit,
  }) as {
    data: Array<{ allowed: boolean; consumed: number; remaining: number; reset_at: string }> | null;
    error: Error | null;
  };
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error("Provider monthly quota check failed");
  if (!result.allowed) throw new ProviderMonthlyQuotaExceededError(options.provider, result.reset_at);
  return result;
}

export function envNumber(name: string, fallback: number) {
  const raw = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env?.get(name);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
