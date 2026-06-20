import {
  groupSimilarAnswers,
  type AnswerGroupingInput,
} from "@/lib/answer-grouping";

export type AnswerGroupingDraft = {
  label: string;
  normalizedAnswer: string;
  confidence: "exact" | "normalized" | "manual_review";
  memberResponseIds: string[];
  memberAttemptIds: string[];
};

export type AnswerGroupingApplyGroup = {
  id: string;
  approved: boolean;
  suggestedAwardedMarks: number | null;
  memberCount: number;
};

export function buildAnswerGroupingDraft(responses: AnswerGroupingInput[]): AnswerGroupingDraft[] {
  return groupSimilarAnswers(responses).map((group) => ({
    label: group.label,
    normalizedAnswer: group.normalized_answer,
    confidence: group.confidence,
    memberResponseIds: [...group.response_ids],
    memberAttemptIds: [...group.attempt_ids],
  }));
}

export function validateAnswerGroupingForApply(groups: AnswerGroupingApplyGroup[], questionMaximum: number) {
  if (!Number.isFinite(questionMaximum) || questionMaximum < 0) {
    throw new Error("A valid question maximum is required before grouped marks can be applied.");
  }
  if (!groups.length || groups.some((group) => group.memberCount < 1)) {
    throw new Error("Every answer group must contain at least one response.");
  }
  if (groups.some((group) => !group.approved)) {
    throw new Error("Every answer group must be approved before marks can be applied.");
  }
  for (const group of groups) {
    if (group.suggestedAwardedMarks === null || !Number.isFinite(group.suggestedAwardedMarks)) {
      throw new Error("Every approved answer group needs an awarded mark.");
    }
    if (group.suggestedAwardedMarks < 0 || group.suggestedAwardedMarks > questionMaximum) {
      throw new Error(`Group marks must be between 0 and cannot exceed ${questionMaximum}.`);
    }
  }
}
