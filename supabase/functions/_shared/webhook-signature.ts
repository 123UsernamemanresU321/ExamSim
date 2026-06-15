const DEFAULT_TOLERANCE_SECONDS = 300;

export type WebhookSignatureVerification = {
  deliveryId: string;
  timestamp: string;
  signature: string;
  usedLegacySecret: boolean;
};

export async function verifyMineruWorkerRequest(request: Request, rawBody: string): Promise<WebhookSignatureVerification> {
  const secret = env("MINERU_WORKER_HMAC_SECRET");
  if (secret) {
    const timestamp = request.headers.get("x-exam-vault-timestamp") ?? "";
    const deliveryId = request.headers.get("x-exam-vault-delivery-id") ?? "";
    const signature = request.headers.get("x-exam-vault-signature") ?? "";
    const toleranceSeconds = envInt("MINERU_WORKER_HMAC_TOLERANCE_SECONDS", DEFAULT_TOLERANCE_SECONDS);
    await verifyWebhookSignatureParts({
      secret,
      rawBody,
      timestamp,
      deliveryId,
      signature,
      toleranceSeconds,
      nowMs: Date.now(),
    });
    return { deliveryId, timestamp, signature, usedLegacySecret: false };
  }

  if (env("EXAM_VAULT_ALLOW_LEGACY_WORKER_SECRET") === "1") {
    const legacySecret = env("MINERU_WORKER_SECRET");
    const provided = request.headers.get("x-mineru-worker-secret") ?? "";
    if (legacySecret && provided && timingSafeEqual(provided, legacySecret)) {
      return {
        deliveryId: request.headers.get("x-exam-vault-delivery-id") || `legacy-${await sha256Hex(rawBody)}`,
        timestamp: new Date().toISOString(),
        signature: "legacy",
        usedLegacySecret: true,
      };
    }
  }

  throw new Error("Unauthorized parser worker");
}

export async function verifyWebhookSignatureParts({
  secret,
  rawBody,
  timestamp,
  deliveryId,
  signature,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  nowMs = Date.now(),
}: {
  secret: string;
  rawBody: string;
  timestamp: string;
  deliveryId: string;
  signature: string;
  toleranceSeconds?: number;
  nowMs?: number;
}) {
  if (!timestamp || !deliveryId || !signature) throw new Error("Missing parser worker signature headers");
  const timestampMs = parseTimestampMs(timestamp);
  if (!Number.isFinite(timestampMs)) throw new Error("Invalid parser worker timestamp");
  if (Math.abs(nowMs - timestampMs) > toleranceSeconds * 1000) throw new Error("Expired parser worker signature");

  const expected = await hmacSha256Hex(secret, `${timestamp}.${deliveryId}.${rawBody}`);
  const provided = normalizeSignature(signature);
  if (!timingSafeEqual(provided, expected)) throw new Error("Invalid parser worker signature");
}

function parseTimestampMs(value: string) {
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    return value.length <= 10 ? numeric * 1000 : numeric;
  }
  return Date.parse(value);
}

function normalizeSignature(value: string) {
  return value.trim().replace(/^sha256=/i, "").toLowerCase();
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(payload: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

function env(name: string) {
  return (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno?.env?.get(name);
}

function envInt(name: string, fallback: number) {
  const raw = env(name);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
