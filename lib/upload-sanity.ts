export type UploadSanityStatus = "accepted" | "accepted_with_warnings" | "needs_review" | "failed";

export type UploadSanityWarning = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
};

export type UploadSanityInput = {
  fileName?: string | null;
  contentType?: string | null;
  fileSizeBytes?: number | null;
  pageCount?: number | null;
  uploadedAtUtc?: string | null;
  activeUntilUtc?: string | null;
  uploadDeadlineUtc?: string | null;
  duplicateFileHashCount?: number;
  mostlyWhitePages?: number;
  rotatedPages?: number;
  renderable?: boolean | null;
};

export type UploadSanityResult = {
  status: UploadSanityStatus;
  pageCount: number | null;
  warnings: UploadSanityWarning[];
  checks: Record<string, unknown>;
};

export function estimatePdfPageCountFromBytes(bytes: Uint8Array): number | null {
  if (!bytes.length) return null;
  const text = new TextDecoder("iso-8859-1").decode(bytes.slice(0, Math.min(bytes.length, 12_000_000)));
  const explicitPageCount = text.match(/\/Type\s*\/Page(?!s)\b/g)?.length ?? 0;
  const pageTreeCount = extractPageTreeCount(text);
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

export function analyzePdfUploadMetadata(input: UploadSanityInput): UploadSanityResult {
  const warnings: UploadSanityWarning[] = [];
  const contentType = input.contentType?.toLowerCase() ?? "";
  const fileName = input.fileName?.toLowerCase() ?? "";
  const fileSizeBytes = input.fileSizeBytes ?? 0;
  const pageCount = input.pageCount ?? null;

  if (!fileName && !contentType) {
    warnings.push({ code: "missing_file_metadata", severity: "high", message: "The uploaded file metadata is missing." });
  }
  if (contentType && contentType !== "application/pdf") {
    warnings.push({ code: "not_pdf_content_type", severity: "high", message: "The upload is not reported as a PDF." });
  }
  if (fileName && !fileName.endsWith(".pdf")) {
    warnings.push({ code: "not_pdf_extension", severity: "medium", message: "The file name does not end with .pdf." });
  }
  if (fileSizeBytes <= 0) {
    warnings.push({ code: "empty_file", severity: "high", message: "The uploaded PDF appears to be empty." });
  } else if (fileSizeBytes < 5_000) {
    warnings.push({ code: "very_small_file", severity: "medium", message: "The PDF is unusually small and may be blank or incomplete." });
  } else if (fileSizeBytes > 10 * 1024 * 1024) {
    warnings.push({ code: "too_large", severity: "high", message: "The PDF is larger than the 10MB upload limit." });
  }

  if (pageCount === 0) warnings.push({ code: "zero_pages", severity: "high", message: "No pages were detected in the PDF." });
  if (pageCount !== null && pageCount > 0 && pageCount < 1) {
    warnings.push({ code: "page_count_invalid", severity: "high", message: "The detected page count is invalid." });
  }
  if (pageCount !== null && pageCount > 25) {
    warnings.push({ code: "high_page_count", severity: "low", message: "The PDF has many pages. Confirm it only contains this question's work." });
  }
  if (input.renderable === false) {
    warnings.push({ code: "render_failed", severity: "high", message: "The PDF could not be rendered for preview." });
  }
  if ((input.mostlyWhitePages ?? 0) > 0) {
    warnings.push({ code: "mostly_blank_pages", severity: "medium", message: "One or more pages appear mostly blank." });
  }
  if ((input.rotatedPages ?? 0) > 0) {
    warnings.push({ code: "rotated_pages", severity: "low", message: "One or more pages may be rotated. Check readability before finalizing." });
  }
  if ((input.duplicateFileHashCount ?? 0) > 1) {
    warnings.push({ code: "duplicate_file", severity: "medium", message: "The same file appears to have been used in more than one upload slot." });
  }

  const uploadTime = input.uploadedAtUtc ? Date.parse(input.uploadedAtUtc) : null;
  const deadlineTime = input.uploadDeadlineUtc ? Date.parse(input.uploadDeadlineUtc) : null;
  if (uploadTime && deadlineTime && uploadTime > deadlineTime) {
    warnings.push({ code: "after_deadline", severity: "high", message: "The upload timestamp is after the upload deadline." });
  }

  const high = warnings.some((warning) => warning.severity === "high");
  const medium = warnings.some((warning) => warning.severity === "medium");
  const status: UploadSanityStatus =
    high ? "failed" : medium ? "needs_review" : warnings.length ? "accepted_with_warnings" : "accepted";

  return {
    status,
    pageCount,
    warnings,
    checks: {
      content_type: contentType || null,
      file_size_bytes: fileSizeBytes,
      renderable: input.renderable ?? null,
      mostly_white_pages: input.mostlyWhitePages ?? 0,
      rotated_pages: input.rotatedPages ?? 0,
      duplicate_file_hash_count: input.duplicateFileHashCount ?? 0,
    },
  };
}
