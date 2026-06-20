import type { AttemptState } from "@/lib/constants";

export type AttemptStateInput = {
  serverNowUtc: string | Date;
  startAtUtc: string | Date;
  endAtUtc: string | Date;
  uploadDeadlineAtUtc?: string | Date | null;
  pausedAtUtc?: string | Date | null;
  solutionsRequested: boolean;
};

function toTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  }
  return time;
}

export function computeAttemptState(input: AttemptStateInput): AttemptState {
  const serverNow = toTime(input.serverNowUtc);
  const start = toTime(input.startAtUtc);
  const end = toTime(input.endAtUtc);
  const uploadDeadline = toTime(input.uploadDeadlineAtUtc);
  const pausedAt = toTime(input.pausedAtUtc);

  if (serverNow === null || start === null || end === null) {
    throw new Error("serverNowUtc, startAtUtc, and endAtUtc are required");
  }

  if (serverNow < start) return "WAITING";
  if (pausedAt !== null && serverNow >= pausedAt) return "PAUSED";
  if (serverNow >= start && serverNow < end) return "ACTIVE";
  if (
    input.solutionsRequested &&
    uploadDeadline !== null &&
    serverNow >= end &&
    serverNow < uploadDeadline
  ) {
    return "UPLOAD_ONLY";
  }
  return "FINISHED_REVIEW";
}

export function getCountdownTarget(
  state: AttemptState,
  input: Pick<AttemptStateInput, "startAtUtc" | "endAtUtc" | "uploadDeadlineAtUtc">,
): string | null {
  if (state === "WAITING") return new Date(input.startAtUtc).toISOString();
  if (state === "ACTIVE") return new Date(input.endAtUtc).toISOString();
  if (state === "UPLOAD_ONLY" && input.uploadDeadlineAtUtc) {
    return new Date(input.uploadDeadlineAtUtc).toISOString();
  }
  return null;
}

export function formatInTimezone(
  utcIso: string,
  timezone = "Africa/Johannesburg",
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
    ...options,
  }).format(new Date(utcIso));
}
