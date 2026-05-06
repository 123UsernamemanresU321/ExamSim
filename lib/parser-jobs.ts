export const PARSE_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "review_required"] as const;
export type ParseJobStatus = (typeof PARSE_JOB_STATUSES)[number];

export function nextParserStatusForMinerUResult(result: { ok: boolean; requiresOwnerReview?: boolean }) {
  if (!result.ok) return "failed" satisfies ParseJobStatus;
  if (result.requiresOwnerReview ?? true) return "review_required" satisfies ParseJobStatus;
  return "succeeded" satisfies ParseJobStatus;
}

export function mineruWorkerInstructions() {
  return [
    "Use hosted MinerU with a server-side API key, or a self-hosted worker only when privacy/cost requirements demand it.",
    "For hosted MinerU, Edge Functions submit a short-lived signed source URL or upload URL and poll by batch id.",
    "Write Markdown, JSON, and ZIP artifacts back to the private assessment-packages bucket.",
    "Mark the parse job review_required so the owner confirms structure before publish.",
  ];
}
