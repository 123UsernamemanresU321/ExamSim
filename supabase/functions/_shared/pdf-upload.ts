export const MAX_STUDENT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PAPER_SCAN_BYTES = 50 * 1024 * 1024;
const PDF_HEADER_SCAN_BYTES = 1024;

export type VerifiedPdfUpload = {
  byteLength: number;
  contentType: "application/pdf";
  pageCount: number | null;
};

type StorageAdmin = {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: Error | null }>;
    };
  };
};

export async function verifyAnswerUploadPdf(admin: StorageAdmin, objectPath: string): Promise<VerifiedPdfUpload> {
  return verifyPrivatePdfUpload(admin, "answer-uploads", objectPath, MAX_STUDENT_UPLOAD_BYTES);
}

export async function verifyPrivatePdfUpload(
  admin: StorageAdmin,
  bucket: string,
  objectPath: string,
  maximumBytes: number,
): Promise<VerifiedPdfUpload> {
  const { data, error } = await admin.storage.from(bucket).download(objectPath);
  if (error || !data) throw new Error("Uploaded PDF could not be opened from private Storage");
  const bytes = new Uint8Array(await data.arrayBuffer());
  assertPdfUploadBytes(bytes, maximumBytes);
  return {
    byteLength: bytes.byteLength,
    contentType: "application/pdf",
    pageCount: estimatePdfPageCount(bytes),
  };
}

export function assertPdfUploadBytes(bytes: Uint8Array, maximumBytes = MAX_STUDENT_UPLOAD_BYTES) {
  if (bytes.byteLength <= 0) throw new Error("Uploaded PDF is empty");
  if (bytes.byteLength > maximumBytes) throw new Error(`PDF uploads must be ${Math.floor(maximumBytes / 1024 / 1024)}MB or smaller`);
  if (!hasPdfMagicBytes(bytes)) throw new Error("Uploaded file is not a valid PDF");
}

export function hasPdfMagicBytes(bytes: Uint8Array) {
  const header = new TextDecoder("iso-8859-1").decode(bytes.slice(0, Math.min(bytes.byteLength, PDF_HEADER_SCAN_BYTES)));
  return header.includes("%PDF-");
}

export function estimatePdfPageCount(bytes: Uint8Array) {
  if (!bytes.length) return null;
  const sample = new TextDecoder("iso-8859-1").decode(bytes.slice(0, Math.min(bytes.length, 12_000_000)));
  const explicitPageCount = sample.match(/\/Type\s*\/Page(?!s)\b/g)?.length ?? 0;
  const pageTreeCount = extractPageTreeCount(sample);
  const candidates = [explicitPageCount, pageTreeCount].filter((count): count is number => typeof count === "number" && count > 0);
  return candidates.length ? Math.max(...candidates) : null;
}

function extractPageTreeCount(pdfText: string): number | null {
  const counts: number[] = [];
  for (const match of pdfText.matchAll(/<<[\s\S]*?>>/g)) {
    const dictionary = match[0];
    if (!/\/Type\s*\/Pages\b/.test(dictionary)) continue;
    const countMatch = dictionary.match(/\/Count\s+(\d+)\b/);
    if (countMatch?.[1]) counts.push(Number(countMatch[1]));
  }
  return counts.length ? Math.max(...counts) : null;
}
