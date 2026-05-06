export const PARSE_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "review_required"] as const;
export type ParseJobStatus = (typeof PARSE_JOB_STATUSES)[number];

export function nextParserStatusForMinerUResult(result: { ok: boolean; requiresOwnerReview?: boolean }) {
  if (!result.ok) return "failed" satisfies ParseJobStatus;
  if (result.requiresOwnerReview ?? true) return "review_required" satisfies ParseJobStatus;
  return "succeeded" satisfies ParseJobStatus;
}

export function mineruWorkerInstructions() {
  return [
    "Pull the source PDF through a short-lived signed URL.",
    "Run MinerU in self-hosted infrastructure with formula and table extraction enabled.",
    "Write Markdown and JSON artifacts back to the private assessment-packages bucket.",
    "Mark the parse job review_required so the owner confirms structure before publish.",
  ];
}
