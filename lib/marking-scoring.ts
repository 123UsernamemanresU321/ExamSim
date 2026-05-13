import type { ResponseMode } from "@/lib/constants";

export type BinaryMarkDecision = "unmarked" | "correct" | "incorrect";

export function responseModeUsesBinaryMarking(responseMode: ResponseMode | string | null | undefined) {
  return responseMode === "multiple_choice" || responseMode === "numerical";
}

export function markForBinaryDecision(decision: BinaryMarkDecision, maxMarks: number | null | undefined) {
  if (decision === "unmarked") return null;
  return decision === "correct" ? Number(maxMarks ?? 0) : 0;
}

export function binaryMarkDecisionFromAwarded(
  awardedMarks: number | null | undefined,
  maxMarks: number | null | undefined,
): BinaryMarkDecision {
  if (awardedMarks === null || awardedMarks === undefined) return "unmarked";
  if (awardedMarks === 0) return "incorrect";
  return awardedMarks === Number(maxMarks ?? 0) ? "correct" : "unmarked";
}
