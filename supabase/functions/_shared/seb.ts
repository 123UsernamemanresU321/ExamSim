export type SebKeys = {
  browserExamKeyHash: string | null;
  configKeyHash: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

export function extractSebKeys(request: Request, body?: Record<string, unknown>): SebKeys {
  const bodyBek = typeof body?.seb_browser_exam_key_hash === "string" ? body.seb_browser_exam_key_hash : null;
  const bodyConfig = typeof body?.seb_config_key_hash === "string" ? body.seb_config_key_hash : null;
  return {
    browserExamKeyHash:
      clean(request.headers.get("x-safeexambrowser-browserexamkeyhash")) ??
      clean(bodyBek) ??
      clean(typeof body?.browser_exam_key_hash === "string" ? body.browser_exam_key_hash : null),
    configKeyHash:
      clean(request.headers.get("x-safeexambrowser-configkeyhash")) ??
      clean(bodyConfig) ??
      clean(typeof body?.config_key_hash === "string" ? body.config_key_hash : null),
  };
}

export function validateSebKeys({
  expectedBrowserExamKeyHashes,
  expectedConfigKeyHashes,
  receivedBrowserExamKeyHash,
  receivedConfigKeyHash,
}: {
  expectedBrowserExamKeyHashes?: string[] | null;
  expectedConfigKeyHashes?: string[] | null;
  receivedBrowserExamKeyHash?: string | null;
  receivedConfigKeyHash?: string | null;
}) {
  const expectedBek = new Set((expectedBrowserExamKeyHashes ?? []).map((value) => value.trim()).filter(Boolean));
  const expectedConfig = new Set((expectedConfigKeyHashes ?? []).map((value) => value.trim()).filter(Boolean));
  if (expectedBek.size === 0 || expectedConfig.size === 0) return { ok: false, reason: "SEB key hashes are not configured." };
  if (!receivedBrowserExamKeyHash || !receivedConfigKeyHash) return { ok: false, reason: "SEB key hashes were not supplied." };
  if (!expectedBek.has(receivedBrowserExamKeyHash)) return { ok: false, reason: "Browser Exam Key hash did not match." };
  if (!expectedConfig.has(receivedConfigKeyHash)) return { ok: false, reason: "Config Key hash did not match." };
  return { ok: true, reason: null };
}
