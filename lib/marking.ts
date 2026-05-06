import type { FeedbackRelease, Mark, RubricCriteria } from "@/types/database";

export function calculateAwardedMarks(marks: Pick<Mark, "awarded_marks">[]) {
  return marks.reduce((total, mark) => total + Number(mark.awarded_marks || 0), 0);
}

export function calculateAvailableMarks(criteria: Pick<RubricCriteria, "max_marks">[]) {
  return criteria.reduce((total, criterion) => total + Number(criterion.max_marks || 0), 0);
}

export function isFeedbackVisibleToStudent(release: Pick<FeedbackRelease, "visible_to_student"> | null) {
  return Boolean(release?.visible_to_student);
}

export function validateAwardedMark(awardedMarks: number, maxMarks: number) {
  if (!Number.isFinite(awardedMarks) || awardedMarks < 0) return "Awarded marks must be zero or greater.";
  if (awardedMarks > maxMarks) return "Awarded marks cannot exceed the criterion maximum.";
  return null;
}
