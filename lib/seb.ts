export type SebKeyInput = {
  expectedBrowserExamKeyHashes?: string[] | null;
  expectedConfigKeyHashes?: string[] | null;
  receivedBrowserExamKeyHash?: string | null;
  receivedConfigKeyHash?: string | null;
};

export type SebValidationResult = { ok: true } | { ok: false; reason: string };

const BEK_HEADER = "x-safeexambrowser-browserexamkeyhash";
const CONFIG_HEADER = "x-safeexambrowser-configkeyhash";

function normalize(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeList(values: string[] | null | undefined) {
  return new Set((values ?? []).map((value) => value.trim()).filter(Boolean));
}

export function validateSebKeys(input: SebKeyInput): SebValidationResult {
  const expectedBek = normalizeList(input.expectedBrowserExamKeyHashes);
  const expectedConfig = normalizeList(input.expectedConfigKeyHashes);
  if (expectedBek.size === 0 || expectedConfig.size === 0) {
    return { ok: false, reason: "SEB expected key hashes are not configured." };
  }

  const receivedBek = normalize(input.receivedBrowserExamKeyHash);
  const receivedConfig = normalize(input.receivedConfigKeyHash);
  if (!receivedBek || !receivedConfig) {
    return { ok: false, reason: "SEB key hashes were not supplied." };
  }
  if (!expectedBek.has(receivedBek)) return { ok: false, reason: "Browser Exam Key hash did not match." };
  if (!expectedConfig.has(receivedConfig)) return { ok: false, reason: "Config Key hash did not match." };
  return { ok: true };
}

export function extractSebKeysFromRecord(record: Record<string, string | null | undefined>) {
  const lowerEntries = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    browserExamKeyHash:
      normalize(lowerEntries[BEK_HEADER]) ??
      normalize(lowerEntries.seb_browser_exam_key_hash) ??
      normalize(lowerEntries.browser_exam_key_hash),
    configKeyHash:
      normalize(lowerEntries[CONFIG_HEADER]) ??
      normalize(lowerEntries.seb_config_key_hash) ??
      normalize(lowerEntries.config_key_hash),
  };
}
