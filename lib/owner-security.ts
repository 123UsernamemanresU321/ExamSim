export const SENSITIVE_OWNER_ACTIONS = [
  "student.created",
  "student_group.created",
  "assessment.published",
  "marking.saved",
  "feedback.released",
  "marking_packet.exported",
  "marks_csv.exported",
] as const;

export type SensitiveOwnerAction = (typeof SENSITIVE_OWNER_ACTIONS)[number];

export function requiresOwnerAal2(action: string) {
  return SENSITIVE_OWNER_ACTIONS.includes(action as SensitiveOwnerAction);
}

export function isAllowedOwnerAal(currentAal: string | null | undefined, action: string) {
  return !requiresOwnerAal2(action) || currentAal === "aal2";
}
