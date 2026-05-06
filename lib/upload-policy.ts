export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_UPLOAD_MIME_TYPES = ["application/pdf"] as const;
export const ACCEPTED_UPLOAD_EXTENSIONS = [".pdf"] as const;

export type UploadPolicyResult = {
  ok: boolean;
  error?: string;
};

export type UploadSlotLockState = {
  status: string;
  object_path?: string | null;
  locked_at?: string | null;
};

export function validatePdfUpload(file: { name: string; size: number; type: string }): UploadPolicyResult {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf")) return { ok: false, error: "Only PDF uploads are accepted." };
  if (file.type && !ACCEPTED_UPLOAD_MIME_TYPES.includes(file.type as "application/pdf")) {
    return { ok: false, error: "The selected file is not reported as a PDF." };
  }
  if (file.size <= 0) return { ok: false, error: "The selected PDF is empty." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "PDF uploads must be 10MB or smaller." };
  return { ok: true };
}

export function uploadSizeLabel(bytes = MAX_UPLOAD_BYTES) {
  return `${Math.floor(bytes / 1024 / 1024)}MB`;
}

export function canAcceptOneFileForSlot(slot: UploadSlotLockState) {
  if (slot.locked_at || slot.object_path) return false;
  return slot.status === "pending" || slot.status === "missing";
}
