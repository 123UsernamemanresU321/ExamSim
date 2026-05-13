export type SebRequestHashes = {
  browserExamRequestHash: string | null;
  configKeyRequestHash: string | null;
};

export type SebValidationResult = { ok: true } | { ok: false; reason: string };

export type SebVerificationMethod = "header" | "js_api" | "handshake_header";

const HEX_64 = /^[a-f0-9]{64}$/i;
const DEFAULT_ALLOWED_ORIGINS = "https://examvault.tutor-mcp.com,https://exam-vault-zeta.vercel.app,http://localhost:3000";

const OFFICIAL_BEK_REQUEST_HASH_HEADER = "x-safeexambrowser-requesthash";
const OFFICIAL_CONFIG_KEY_HASH_HEADER = "x-safeexambrowser-configkeyhash";

// Deprecated aliases kept only for compatibility diagnostics and tests. New integrations must use the official headers.
const DEPRECATED_BEK_HEADER_ALIAS = "x-safeexambrowser-browserexamkeyhash";

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function isValidSebBaseKey(value: string | null | undefined) {
  return Boolean(value && HEX_64.test(value.trim()));
}

export function canonicalizeSebUrl(value: string) {
  const withoutFragment = value.split("#", 1)[0];
  const parsed = new URL(withoutFragment);
  parsed.hash = "";
  return parsed.toString();
}

export async function buildSebBrowserExamRequestHash(url: string, copiedKey: string) {
  if (!isValidSebBaseKey(copiedKey)) throw new Error("SEB copied key must be a 64-character hex string");
  const canonicalUrl = canonicalizeSebUrl(url);
  const bytes = new TextEncoder().encode(`${copiedKey.trim().toLowerCase()}${canonicalUrl}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildSebConfigKeyRequestHash(url: string, copiedKey: string) {
  if (!isValidSebBaseKey(copiedKey)) throw new Error("SEB copied key must be a 64-character hex string");
  const canonicalUrl = canonicalizeSebUrl(url);
  const bytes = new TextEncoder().encode(`${canonicalUrl}${copiedKey.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifySebRequestHashes({
  expectedBrowserExamKeys,
  expectedConfigKeys,
  receivedBrowserExamRequestHash,
  receivedConfigKeyRequestHash,
  url,
}: {
  expectedBrowserExamKeys?: string[] | null;
  expectedConfigKeys?: string[] | null;
  receivedBrowserExamRequestHash?: string | null;
  receivedConfigKeyRequestHash?: string | null;
  url: string;
}): Promise<SebValidationResult> {
  const expectedBek = normalizeKeyList(expectedBrowserExamKeys);
  const expectedConfig = normalizeKeyList(expectedConfigKeys);
  if (containsMalformedKey(expectedBrowserExamKeys)) return { ok: false, reason: "SEB Browser Exam Key is malformed." };
  if (containsMalformedKey(expectedConfigKeys)) return { ok: false, reason: "SEB Config Key is malformed." };
  if (expectedBek.length === 0) return { ok: false, reason: "SEB Browser Exam Key is not configured." };
  if (expectedConfig.length === 0) return { ok: false, reason: "SEB Config Key is not configured." };

  const receivedBek = clean(receivedBrowserExamRequestHash);
  const receivedConfig = clean(receivedConfigKeyRequestHash);
  if (!receivedBek || !receivedConfig) return { ok: false, reason: "SEB request hashes were not supplied." };
  if (!HEX_64.test(receivedBek)) return { ok: false, reason: "SEB Browser Exam request hash is malformed." };
  if (!HEX_64.test(receivedConfig)) return { ok: false, reason: "SEB Config Key request hash is malformed." };

  if (!(await matchesAnyBrowserExamRequestHash(url, expectedBek, receivedBek))) {
    return { ok: false, reason: "Browser Exam Key request hash did not match this URL." };
  }
  if (!(await matchesAnyConfigKeyRequestHash(url, expectedConfig, receivedConfig))) {
    return { ok: false, reason: "Config Key request hash did not match this URL." };
  }
  return { ok: true };
}

export function extractSebRequestHashes(request: Request): SebRequestHashes {
  return {
    browserExamRequestHash:
      clean(request.headers.get(OFFICIAL_BEK_REQUEST_HASH_HEADER)) ?? clean(request.headers.get(DEPRECATED_BEK_HEADER_ALIAS)),
    configKeyRequestHash: clean(request.headers.get(OFFICIAL_CONFIG_KEY_HASH_HEADER)),
  };
}

export function validateSebPublishKeys({
  deliveryMode,
  browserExamKeys,
  configKeys,
}: {
  deliveryMode: string;
  browserExamKeys?: string[] | null;
  configKeys?: string[] | null;
}): SebValidationResult {
  if (deliveryMode !== "seb_required") return { ok: true };
  const normalizedBrowserExamKeys = normalizeRawList(browserExamKeys);
  const normalizedConfigKeys = normalizeRawList(configKeys);
  if (normalizedBrowserExamKeys.some((key) => !isValidSebBaseKey(key))) {
    return { ok: false, reason: "Every Browser Exam Key must be a 64-character hex string." };
  }
  if (normalizedConfigKeys.some((key) => !isValidSebBaseKey(key))) {
    return { ok: false, reason: "Every Config Key must be a 64-character hex string." };
  }
  if (normalizedBrowserExamKeys.length === 0) {
    return { ok: false, reason: "At least one 64-character Browser Exam Key is required for SEB mode." };
  }
  if (normalizedConfigKeys.length === 0) {
    return { ok: false, reason: "At least one 64-character Config Key is required for SEB mode." };
  }
  return { ok: true };
}

export function allowedSebOrigins() {
  return (Deno.env.get("APP_ALLOWED_ORIGINS") ?? DEFAULT_ALLOWED_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function sebVerificationTtlSeconds() {
  const parsed = Number(Deno.env.get("SEB_SESSION_VERIFICATION_TTL_SECONDS") ?? 300);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 300;
}

export function validateSebPageUrl({
  pageUrl,
  attemptId,
  allowedOrigins,
}: {
  pageUrl: string;
  attemptId: string;
  allowedOrigins: string[];
}): { ok: true; url: string } | { ok: false; reason: string } {
  let canonicalUrl: string;
  let parsed: URL;
  try {
    canonicalUrl = canonicalizeSebUrl(pageUrl);
    parsed = new URL(canonicalUrl);
  } catch {
    return { ok: false, reason: "SEB page URL is invalid." };
  }
  if (!new Set(allowedOrigins).has(parsed.origin)) return { ok: false, reason: "SEB page URL origin is not allowed." };
  if (parsed.pathname !== `/student/attempts/${attemptId}/exam`) {
    return { ok: false, reason: "SEB page URL does not match this attempt exam route." };
  }
  return { ok: true, url: canonicalUrl };
}

export function receivedHashesFromJsApi(body: Record<string, unknown>): SebRequestHashes {
  return {
    browserExamRequestHash: typeof body.browser_exam_request_hash === "string" ? clean(body.browser_exam_request_hash) : null,
    configKeyRequestHash: typeof body.config_key_request_hash === "string" ? clean(body.config_key_request_hash) : null,
  };
}

function normalizeKeyList(values: string[] | null | undefined) {
  return [...new Set((values ?? []).map(clean).filter((value): value is string => Boolean(value)))].filter(isValidSebBaseKey);
}

function normalizeRawList(values: string[] | null | undefined) {
  return [...new Set((values ?? []).map(clean).filter((value): value is string => Boolean(value)))];
}

function containsMalformedKey(values: string[] | null | undefined) {
  return normalizeRawList(values).some((value) => !isValidSebBaseKey(value));
}

async function matchesAnyBrowserExamRequestHash(url: string, expectedKeys: string[], receivedRequestHash: string) {
  for (const key of expectedKeys) {
    if ((await buildSebBrowserExamRequestHash(url, key)) === receivedRequestHash) return true;
  }
  return false;
}

async function matchesAnyConfigKeyRequestHash(url: string, expectedKeys: string[], receivedRequestHash: string) {
  for (const key of expectedKeys) {
    if ((await buildSebConfigKeyRequestHash(url, key)) === receivedRequestHash) return true;
  }
  return false;
}
