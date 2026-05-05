import type { AttemptState } from "@/lib/constants";

export function canReleaseAttemptPackage(state: AttemptState) {
  return state !== "WAITING";
}

export function canIssueUploadSlotUrl({
  state,
  uploadsDuringActive,
}: {
  state: AttemptState;
  uploadsDuringActive: boolean;
}) {
  if (state === "FINISHED_REVIEW" || state === "WAITING") return false;
  if (state === "ACTIVE") return uploadsDuringActive;
  return state === "UPLOAD_ONLY";
}

export function canSaveTextResponse({
  state,
  typedEnabled,
}: {
  state: AttemptState;
  typedEnabled: boolean;
}) {
  return state === "ACTIVE" && typedEnabled;
}

export function assertOwnAttempt(profileId: string, assigneeProfileId: string) {
  return profileId === assigneeProfileId;
}

export function isAppendOnlyEventOperation(operation: "insert" | "update" | "delete") {
  return operation === "insert";
}
