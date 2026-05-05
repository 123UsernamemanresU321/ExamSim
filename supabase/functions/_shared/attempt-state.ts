export type AttemptState = "WAITING" | "ACTIVE" | "UPLOAD_ONLY" | "FINISHED_REVIEW";

export function computeAttemptState(input: {
  serverNowUtc: string;
  startAtUtc: string;
  endAtUtc: string;
  uploadDeadlineAtUtc?: string | null;
  solutionsRequested: boolean;
}): AttemptState {
  const now = Date.parse(input.serverNowUtc);
  const start = Date.parse(input.startAtUtc);
  const end = Date.parse(input.endAtUtc);
  const uploadDeadline = input.uploadDeadlineAtUtc ? Date.parse(input.uploadDeadlineAtUtc) : null;

  if (now < start) return "WAITING";
  if (now >= start && now < end) return "ACTIVE";
  if (
    input.solutionsRequested &&
    uploadDeadline !== null &&
    now >= end &&
    now < uploadDeadline
  ) {
    return "UPLOAD_ONLY";
  }
  return "FINISHED_REVIEW";
}

export function getCountdownTarget(
  state: AttemptState,
  attempt: {
    start_at_utc: string;
    end_at_utc: string;
    upload_deadline_at_utc?: string | null;
  },
) {
  if (state === "WAITING") return attempt.start_at_utc;
  if (state === "ACTIVE") return attempt.end_at_utc;
  if (state === "UPLOAD_ONLY") return attempt.upload_deadline_at_utc;
  return null;
}
