export type MineruUploadMode = "signed_url" | "file_upload";

export type MineruBatchRequest = {
  enable_formula: true;
  enable_table: true;
  language: string;
  model_version: string;
  files: { url?: string; name?: string; is_ocr: true; data_id: string }[];
};

export type MineruBatchSubmit = {
  batchId: string;
  traceId: string | null;
  uploadUrls: string[];
};

export type MineruExtractResult = {
  state: "pending" | "running" | "done" | "failed" | "unknown";
  fileName: string | null;
  dataId: string | null;
  fullZipUrl: string | null;
  error: string | null;
  raw: unknown;
};

export function mineruApiBaseUrl() {
  return (Deno.env.get("MINERU_API_BASE_URL") || "https://mineru.net").replace(/\/+$/, "");
}

export function mineruUploadMode(): MineruUploadMode {
  return Deno.env.get("MINERU_UPLOAD_MODE") === "file_upload" ? "file_upload" : "signed_url";
}

export function buildMineruAuthHeaders() {
  const apiKey = Deno.env.get("MINERU_API_KEY");
  if (!apiKey) throw new Error("MINERU_API_KEY is not configured");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  const accountToken = Deno.env.get("MINERU_ACCOUNT_TOKEN");
  if (accountToken) headers.token = accountToken;
  return headers;
}

export function buildMineruBatchRequest(input: {
  dataId: string;
  signedUrl?: string;
  fileName?: string;
  uploadMode: MineruUploadMode;
  modelVersion?: string;
}): MineruBatchRequest {
  const language = Deno.env.get("MINERU_LANGUAGE") || "en";
  const modelVersion = input.modelVersion || Deno.env.get("MINERU_MODEL_VERSION") || "pipeline";
  return {
    enable_formula: true,
    enable_table: true,
    language,
    model_version: modelVersion,
    files: [
      {
        url: input.uploadMode === "signed_url" ? input.signedUrl : input.fileName,
        is_ocr: true,
        data_id: input.dataId,
      },
    ],
  };
}

export function normalizeMineruBatchSubmitResponse(raw: unknown): MineruBatchSubmit {
  const record = asRecord(raw);
  if (Number(record.code ?? 0) !== 0) throw new Error(String(record.msg || "MinerU batch submission failed"));
  
  const dataRaw = record.data;
  const data = Array.isArray(dataRaw) ? asRecord(dataRaw[0]) : asRecord(dataRaw);
  
  const batchId = stringValue(data.batch_id ?? record.batch_id ?? (Array.isArray(dataRaw) ? dataRaw[0]?.batch_id : null));
  if (!batchId) {
    console.error("MinerU response missing batch_id. Raw response:", JSON.stringify(raw));
    throw new Error("MinerU response did not include batch_id");
  }
  
  // Search for upload URLs in the data object/array and the root record
  const uploadUrls = [
    ...extractMineruUploadUrls(data),
    ...extractMineruUploadUrls(record),
    ...(Array.isArray(dataRaw) ? extractMineruUploadUrls(dataRaw[0]) : []),
  ].filter((url, index, self) => self.indexOf(url) === index); // Unique URLs

  if (uploadUrls.length === 0) {
    console.error("MinerU response missing upload URLs. Raw response:", JSON.stringify(raw));
  }

  return {
    batchId,
    traceId: stringValue(record.trace_id),
    uploadUrls,
  };
}

export function pickMineruExtractResult(raw: unknown, dataId: string): MineruExtractResult {
  const record = asRecord(raw);
  if (Number(record.code ?? 0) !== 0) {
    return { state: "failed", fileName: null, dataId, fullZipUrl: null, error: String(record.msg || "MinerU result lookup failed"), raw };
  }
  const data = asRecord(record.data);
  const candidates = normalizeResultList(data.extract_result ?? data.extract_results ?? data.results);
  const selected =
    candidates.find((item) => stringValue(item.data_id) === dataId) ??
    candidates.find((item) => stringValue(item.dataId) === dataId) ??
    candidates[0] ??
    {};
  return {
    state: normalizeState(stringValue(selected.state ?? selected.status ?? data.state ?? data.status)),
    fileName: stringValue(selected.file_name ?? selected.fileName ?? data.file_name ?? data.fileName),
    dataId: stringValue(selected.data_id ?? selected.dataId) ?? dataId,
    fullZipUrl: stringValue(
      selected.full_zip_url ?? selected.fullZipUrl ?? 
      selected.zip_url ?? selected.zipUrl ?? 
      selected.download_url ?? selected.downloadUrl ??
      selected.file_url ?? selected.fileUrl ??
      data.full_zip_url ?? data.fullZipUrl ??
      data.download_url ?? data.downloadUrl ??
      data.file_url ?? data.fileUrl
    ),
    error: stringValue(selected.err_msg ?? selected.error_msg ?? selected.error ?? data.err_msg ?? data.error_msg ?? data.error),
    raw: selected,
  };
}

export function extractMineruUploadUrls(rawData: unknown): string[] {
  const data = asRecord(rawData);
  const direct = data.file_urls ?? data.fileUrls ?? data.upload_urls ?? data.uploadUrls ?? data.upload_url ?? data.uploadUrl ?? data.file_url ?? data.fileUrl;
  if (Array.isArray(direct)) return direct.map((value) => String(value)).filter(Boolean);
  if (typeof direct === "string" && direct.trim()) return [direct.trim()];
  if (direct && typeof direct === "object") return Object.values(direct).map((value) => String(value)).filter(Boolean);
  
  const files = data.files;
  if (!Array.isArray(files)) return [];
  return files
    .map((file) => {
      const record = asRecord(file);
      return stringValue(record.upload_url ?? record.uploadUrl ?? record.url);
    })
    .filter((value): value is string => Boolean(value));
}

function normalizeResultList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord);
  if (value && typeof value === "object") return [asRecord(value)];
  return [];
}

function normalizeState(value: string | null): MineruExtractResult["state"] {
  const normalized = (value || "").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["done", "success", "succeeded", "finished", "completed"].includes(normalized)) return "done";
  if (["failed", "error", "fail", "timeout", "timed_out", "expired", "canceled", "cancelled"].includes(normalized)) return "failed";
  if (["running", "processing", "parsing", "converting", "in_progress"].includes(normalized)) return "running";
  if (["pending", "waiting", "queued", "created", "submitted"].includes(normalized)) return "pending";
  return "unknown";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
