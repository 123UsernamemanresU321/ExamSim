export type SebRequestHashInput = {
  expectedBrowserExamKeys?: string[] | null;
  expectedConfigKeys?: string[] | null;
  receivedBrowserExamRequestHash?: string | null;
  receivedConfigKeyRequestHash?: string | null;
  url: string;
};

export type SebValidationResult = { ok: true } | { ok: false; reason: string };

export type SebRequestHashes = {
  browserExamRequestHash: string | null;
  configKeyRequestHash: string | null;
};

const HEX_64 = /^[a-f0-9]{64}$/i;

const OFFICIAL_BEK_REQUEST_HASH_HEADER = "x-safeexambrowser-requesthash";
const OFFICIAL_CONFIG_KEY_HASH_HEADER = "x-safeexambrowser-configkeyhash";

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

export async function verifySebRequestHashes(input: SebRequestHashInput): Promise<SebValidationResult> {
  const expectedBek = normalizeKeyList(input.expectedBrowserExamKeys);
  const expectedConfig = normalizeKeyList(input.expectedConfigKeys);
  if (containsMalformedKey(input.expectedBrowserExamKeys)) return { ok: false, reason: "SEB Browser Exam Key is malformed." };
  if (containsMalformedKey(input.expectedConfigKeys)) return { ok: false, reason: "SEB Config Key is malformed." };
  if (expectedBek.length === 0) return { ok: false, reason: "SEB Browser Exam Key is not configured." };
  if (expectedConfig.length === 0) return { ok: false, reason: "SEB Config Key is not configured." };

  const receivedBek = clean(input.receivedBrowserExamRequestHash);
  const receivedConfig = clean(input.receivedConfigKeyRequestHash);
  if (!receivedBek || !receivedConfig) return { ok: false, reason: "SEB request hashes were not supplied." };
  if (!HEX_64.test(receivedBek)) return { ok: false, reason: "SEB Browser Exam request hash is malformed." };
  if (!HEX_64.test(receivedConfig)) return { ok: false, reason: "SEB Config Key request hash is malformed." };

  const browserExamMatches = await matchesAnyBrowserExamRequestHash(input.url, expectedBek, receivedBek);
  if (!browserExamMatches) return { ok: false, reason: "Browser Exam Key request hash did not match this URL." };

  const configMatches = await matchesAnyConfigKeyRequestHash(input.url, expectedConfig, receivedConfig);
  if (!configMatches) return { ok: false, reason: "Config Key request hash did not match this URL." };

  return { ok: true };
}

export function extractSebRequestHashesFromRecord(record: Record<string, string | null | undefined>): SebRequestHashes {
  const lowerEntries = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    browserExamRequestHash:
      clean(lowerEntries[OFFICIAL_BEK_REQUEST_HASH_HEADER]) ?? clean(lowerEntries[DEPRECATED_BEK_HEADER_ALIAS]),
    configKeyRequestHash: clean(lowerEntries[OFFICIAL_CONFIG_KEY_HASH_HEADER]),
  };
}

export function validateSebPublishKeys(input: {
  deliveryMode: "browser" | "seb_required" | string;
  browserExamKeys?: string[] | null;
  configKeys?: string[] | null;
}): SebValidationResult {
  if (input.deliveryMode !== "seb_required") return { ok: true };
  const browserExamKeys = normalizeRawList(input.browserExamKeys);
  const configKeys = normalizeRawList(input.configKeys);
  if (browserExamKeys.some((key) => !isValidSebBaseKey(key))) {
    return { ok: false, reason: "Every Browser Exam Key must be a 64-character hex string." };
  }
  if (configKeys.some((key) => !isValidSebBaseKey(key))) {
    return { ok: false, reason: "Every Config Key must be a 64-character hex string." };
  }
  if (browserExamKeys.length === 0) return { ok: false, reason: "At least one Browser Exam Key is required for SEB mode." };
  if (configKeys.length === 0) return { ok: false, reason: "At least one Config Key is required for SEB mode." };
  return { ok: true };
}

export function allowedOriginsFromString(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function validateSebPageUrl(input: {
  pageUrl: string;
  attemptId: string;
  allowedOrigins: string[];
}): { ok: true; url: string } | { ok: false; reason: string } {
  let canonicalUrl: string;
  let parsed: URL;
  try {
    canonicalUrl = canonicalizeSebUrl(input.pageUrl);
    parsed = new URL(canonicalUrl);
  } catch {
    return { ok: false, reason: "SEB page URL is invalid." };
  }

  const allowed = new Set(input.allowedOrigins.map((origin) => origin.trim()).filter(Boolean));
  if (!allowed.has(parsed.origin)) return { ok: false, reason: "SEB page URL origin is not allowed." };
  if (parsed.pathname !== `/student/attempts/${input.attemptId}/exam`) {
    return { ok: false, reason: "SEB page URL does not match this attempt exam route." };
  }
  return { ok: true, url: canonicalUrl };
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
