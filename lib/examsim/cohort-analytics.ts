export type CohortAnalyticsInput = {
  cohorts: Array<{ id: string; name: string; memberIds: string[] }>;
  attempts: Array<{ id: string; studentProfileId: string | null; assessmentId: string; assessmentVersionId: string; state: string; released: boolean }>;
  questions: Array<{ id: string; assessmentVersionId: string; marks: number | null; parentNodeId: string | null }>;
  marks: Array<{ attemptId: string; questionNodeId: string | null; awardedMarks: number }>;
  topicLinks: Array<{ questionNodeId: string; label: string }>;
  standardLinks: Array<{ questionNodeId: string; label: string }>;
  assessments: Array<{ id: string; title: string }>;
};

export type CohortAnalyticsReport = {
  cohortId: string;
  cohortName: string;
  memberCount: number;
  attemptCount: number;
  finishedAttemptCount: number;
  completionPercent: number | null;
  markingCompletionPercent: number | null;
  averagePercent: number | null;
  atRiskStudentCount: number;
  topicMastery: Array<{ label: string; averagePercent: number; evidenceCount: number }>;
  standardMastery: Array<{ label: string; averagePercent: number; evidenceCount: number }>;
  paperComparison: Array<{ assessmentId: string; title: string; averagePercent: number; attemptCount: number }>;
};

export function computeCohortAnalytics(input: CohortAnalyticsInput): CohortAnalyticsReport[] {
  const assessmentById = new Map(input.assessments.map((assessment) => [assessment.id, assessment.title]));
  const parentsWithScoredChildren = new Set(input.questions.filter((question) => question.parentNodeId && positive(question.marks) > 0).map((question) => String(question.parentNodeId)));
  const scoreableQuestions = input.questions.filter((question) => positive(question.marks) > 0 && !parentsWithScoredChildren.has(question.id));
  const questionById = new Map(scoreableQuestions.map((question) => [question.id, question]));
  const questionsByVersion = groupBy(scoreableQuestions, (question) => question.assessmentVersionId);
  const marksByAttempt = groupBy(input.marks, (mark) => mark.attemptId);
  const topicsByQuestion = groupBy(input.topicLinks, (link) => link.questionNodeId);
  const standardsByQuestion = groupBy(input.standardLinks, (link) => link.questionNodeId);

  return input.cohorts.map((cohort) => {
    const memberIds = new Set(cohort.memberIds);
    const attempts = input.attempts.filter((attempt) => attempt.studentProfileId && memberIds.has(attempt.studentProfileId));
    const finished = attempts.filter((attempt) => isFinished(attempt.state));
    const scored = finished.map((attempt) => {
      const questions = questionsByVersion.get(attempt.assessmentVersionId) ?? [];
      const possible = questions.reduce((sum, question) => sum + positive(question.marks), 0);
      const questionIds = new Set(questions.map((question) => question.id));
      const awarded = (marksByAttempt.get(attempt.id) ?? []).filter((mark) => mark.questionNodeId && questionIds.has(mark.questionNodeId)).reduce((sum, mark) => sum + positive(mark.awardedMarks), 0);
      return { attempt, percent: possible > 0 ? Math.min(100, awarded / possible * 100) : null };
    });
    const studentPercents = new Map<string, number[]>();
    for (const item of scored) if (item.attempt.studentProfileId && item.percent !== null) studentPercents.set(item.attempt.studentProfileId, [...(studentPercents.get(item.attempt.studentProfileId) ?? []), item.percent]);
    const atRiskStudentCount = [...studentPercents.values()].filter((values) => (average(values) ?? 100) < 50).length;
    return {
      cohortId: cohort.id,
      cohortName: cohort.name,
      memberCount: cohort.memberIds.length,
      attemptCount: attempts.length,
      finishedAttemptCount: finished.length,
      completionPercent: attempts.length ? percent(finished.length, attempts.length) : null,
      markingCompletionPercent: finished.length ? percent(finished.filter((attempt) => attempt.released).length, finished.length) : null,
      averagePercent: roundedAverage(scored.flatMap((item) => item.percent === null ? [] : [item.percent])),
      atRiskStudentCount,
      topicMastery: masteryForAttempts(finished, marksByAttempt, questionById, topicsByQuestion),
      standardMastery: masteryForAttempts(finished, marksByAttempt, questionById, standardsByQuestion),
      paperComparison: [...groupBy(scored, (item) => item.attempt.assessmentId).entries()].map(([assessmentId, items]) => ({ assessmentId, title: assessmentById.get(assessmentId) ?? "Assessment", averagePercent: roundedAverage(items.flatMap((item) => item.percent === null ? [] : [item.percent])), attemptCount: items.length })).filter((item): item is { assessmentId: string; title: string; averagePercent: number; attemptCount: number } => item.averagePercent !== null).sort((a, b) => a.averagePercent - b.averagePercent),
    };
  });
}

function masteryForAttempts<T extends { questionNodeId: string; label: string }>(attempts: CohortAnalyticsInput["attempts"], marksByAttempt: Map<string, CohortAnalyticsInput["marks"]>, questionById: Map<string, CohortAnalyticsInput["questions"][number]>, linksByQuestion: Map<string, T[]>) {
  const totals = new Map<string, { awarded: number; possible: number; evidenceCount: number }>();
  for (const attempt of attempts) for (const mark of marksByAttempt.get(attempt.id) ?? []) {
    if (!mark.questionNodeId) continue;
    const question = questionById.get(mark.questionNodeId);
    const possible = positive(question?.marks);
    if (!question || possible <= 0 || question.assessmentVersionId !== attempt.assessmentVersionId) continue;
    for (const link of linksByQuestion.get(question.id) ?? []) {
      const total = totals.get(link.label) ?? { awarded: 0, possible: 0, evidenceCount: 0 };
      total.awarded += positive(mark.awardedMarks);
      total.possible += possible;
      total.evidenceCount += 1;
      totals.set(link.label, total);
    }
  }
  return [...totals.entries()].map(([label, total]) => ({ label, averagePercent: total.possible ? percent(total.awarded, total.possible) : 0, evidenceCount: total.evidenceCount })).sort((a, b) => a.averagePercent - b.averagePercent || a.label.localeCompare(b.label));
}

function groupBy<T>(values: T[], key: (value: T) => string) { const groups = new Map<string, T[]>(); for (const value of values) groups.set(key(value), [...(groups.get(key(value)) ?? []), value]); return groups; }
function positive(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function roundedAverage(values: number[]) { const value = average(values); return value === null ? null : Math.round(value * 10000) / 10000; }
function percent(numerator: number, denominator: number) { return denominator > 0 ? Math.round(Math.min(100, numerator / denominator * 100) * 10000) / 10000 : 0; }
function isFinished(state: string) { return ["FINISHED_REVIEW", "SUBMITTED", "RETURNED", "FINALIZED"].includes(state); }
