export type AnalyticsAttemptInput = {
  id: string;
  assessment_id?: string | null;
  state?: string | null;
  duration_seconds?: number | null;
};

export type AnalyticsQuestionInput = {
  id: string;
  assessment_id?: string | null;
  assessment_version_id?: string | null;
  node_key: string;
  title?: string | null;
  marks: number | null;
  response_mode?: string | null;
};

export type AnalyticsMarkInput = {
  attempt_id: string;
  question_node_id: string | null;
  awarded_marks: number;
};

export type AnalyticsTopicLinkInput = {
  question_node_id: string;
  tag: string;
};

export type AnalyticsRubricAwardInput = {
  question_node_id: string;
  awarded_marks: number;
  max_marks: number;
  label?: string | null;
};

export type TeacherAnalyticsSnapshot = {
  finishedAttemptCount: number;
  averagePercent: number | null;
  scoreDistribution: Array<{ label: string; count: number }>;
  questionDifficulty: Array<{ questionNodeId: string; nodeKey: string; title: string | null; averagePercent: number | null; attempts: number }>;
  topicWeaknesses: Array<{ tag: string; averagePercent: number | null; attempts: number }>;
  rubricLossBreakdown: Array<{ label: string; lostMarks: number; possibleMarks: number }>;
  studentSupportFlags: Array<{ attemptId: string; reason: string; percent: number | null }>;
};

export function computeTeacherAnalyticsSnapshot({
  attempts,
  questionNodes,
  marks,
  topicLinks = [],
  rubricAwards = [],
}: {
  attempts: AnalyticsAttemptInput[];
  questionNodes: AnalyticsQuestionInput[];
  marks: AnalyticsMarkInput[];
  topicLinks?: AnalyticsTopicLinkInput[];
  rubricAwards?: AnalyticsRubricAwardInput[];
}): TeacherAnalyticsSnapshot {
  const finishedAttempts = attempts.filter((attempt) => isFinishedState(attempt.state));
  const marksByAttempt = groupBy(marks, (mark) => mark.attempt_id);
  const attemptPercents = finishedAttempts.map((attempt) => {
    const attemptMarks = marksByAttempt.get(attempt.id) ?? [];
    const maxMarks = questionNodes
      .filter((question) => !attempt.assessment_id || !question.assessment_id || question.assessment_id === attempt.assessment_id)
      .reduce((sum, question) => sum + positiveNumber(question.marks), 0);
    const awarded = attemptMarks.reduce((sum, mark) => sum + positiveNumber(mark.awarded_marks), 0);
    return {
      attemptId: attempt.id,
      percent: maxMarks > 0 ? (awarded / maxMarks) * 100 : null,
    };
  });

  const averagePercent = average(attemptPercents.map((item) => item.percent).filter(isNumber));
  const questionDifficulty = questionNodes.map((question) => {
    const questionMarks = marks.filter((mark) => mark.question_node_id === question.id);
    const max = positiveNumber(question.marks);
    const percentages = max > 0 ? questionMarks.map((mark) => (positiveNumber(mark.awarded_marks) / max) * 100) : [];
    return {
      questionNodeId: question.id,
      nodeKey: question.node_key,
      title: question.title ?? null,
      averagePercent: average(percentages),
      attempts: questionMarks.length,
    };
  }).sort((a, b) => nullableSort(a.averagePercent, b.averagePercent) || a.nodeKey.localeCompare(b.nodeKey));

  const topicByQuestion = groupBy(topicLinks, (link) => link.question_node_id);
  const topicTotals = new Map<string, { awarded: number; possible: number; attempts: number }>();
  for (const question of questionNodes) {
    const links = topicByQuestion.get(question.id) ?? [];
    if (!links.length) continue;
    const max = positiveNumber(question.marks);
    if (!max) continue;
    const questionMarks = marks.filter((mark) => mark.question_node_id === question.id);
    for (const mark of questionMarks) {
      for (const link of links) {
        const existing = topicTotals.get(link.tag) ?? { awarded: 0, possible: 0, attempts: 0 };
        existing.awarded += positiveNumber(mark.awarded_marks);
        existing.possible += max;
        existing.attempts += 1;
        topicTotals.set(link.tag, existing);
      }
    }
  }
  const topicWeaknesses = [...topicTotals.entries()]
    .map(([tag, total]) => ({
      tag,
      averagePercent: total.possible > 0 ? (total.awarded / total.possible) * 100 : null,
      attempts: total.attempts,
    }))
    .sort((a, b) => nullableSort(a.averagePercent, b.averagePercent) || a.tag.localeCompare(b.tag));

  const rubricLossByLabel = new Map<string, { lostMarks: number; possibleMarks: number }>();
  for (const award of rubricAwards) {
    const label = (award.label || "Rubric point").trim();
    const possibleMarks = positiveNumber(award.max_marks);
    const lostMarks = Math.max(0, possibleMarks - positiveNumber(award.awarded_marks));
    const existing = rubricLossByLabel.get(label) ?? { lostMarks: 0, possibleMarks: 0 };
    existing.lostMarks += lostMarks;
    existing.possibleMarks += possibleMarks;
    rubricLossByLabel.set(label, existing);
  }
  const rubricLossBreakdown = [...rubricLossByLabel.entries()]
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.lostMarks - a.lostMarks || a.label.localeCompare(b.label));

  const studentSupportFlags = attemptPercents
    .filter((item) => item.percent !== null && item.percent < 50)
    .map((item) => ({ attemptId: item.attemptId, reason: "Low score", percent: item.percent }));

  return {
    finishedAttemptCount: finishedAttempts.length,
    averagePercent,
    scoreDistribution: buildScoreDistribution(attemptPercents.map((item) => item.percent)),
    questionDifficulty,
    topicWeaknesses,
    rubricLossBreakdown,
    studentSupportFlags,
  };
}

function isFinishedState(state: string | null | undefined) {
  return state === "FINISHED_REVIEW" || state === "SUBMITTED" || state === "RETURNED" || state === "FINALIZED";
}

function buildScoreDistribution(percentages: Array<number | null>) {
  const buckets = [
    { label: "0-39%", min: 0, max: 40, count: 0 },
    { label: "40-59%", min: 40, max: 60, count: 0 },
    { label: "60-79%", min: 60, max: 80, count: 0 },
    { label: "80-100%", min: 80, max: 101, count: 0 },
  ];
  for (const percent of percentages) {
    if (!isNumber(percent)) continue;
    const bucket = buckets.find((candidate) => percent >= candidate.min && percent < candidate.max);
    if (bucket) bucket.count += 1;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    const existing = groups.get(itemKey) ?? [];
    existing.push(item);
    groups.set(itemKey, existing);
  }
  return groups;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableSort(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
