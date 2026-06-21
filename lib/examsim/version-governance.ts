export type MutableAssessmentVersionStatus = "draft" | "review_required";

export function isAssessmentVersionMutable(status: string | null | undefined): status is MutableAssessmentVersionStatus {
  return status === "draft" || status === "review_required";
}

export function assertAssessmentVersionMutable(status: string | null | undefined) {
  if (!isAssessmentVersionMutable(status)) {
    throw new Error("Published versions are frozen. Create a new draft version before editing.");
  }
}

export function shouldDeleteSharedSourceObject({
  sourceDocumentReferences,
  versionReferences,
}: {
  sourceDocumentReferences: number;
  versionReferences: number;
}) {
  return sourceDocumentReferences === 0 && versionReferences === 0;
}

type DiffQuestion = {
  node_key: string;
  title: string | null;
  marks: number | null;
  response_mode: string | null;
  prompt_html: string | null;
  prompt_latex: string | null;
};

export type AssessmentVersionDiffField =
  | "question_text"
  | "marks"
  | "response_type"
  | "source_regions"
  | "rubrics"
  | "topics";

export function buildAssessmentVersionDiff({
  fromQuestions,
  toQuestions,
  fromRegionCount,
  toRegionCount,
  fromRubricMarks,
  toRubricMarks,
  fromTopicKeys,
  toTopicKeys,
}: {
  fromQuestions: DiffQuestion[];
  toQuestions: DiffQuestion[];
  fromRegionCount: number;
  toRegionCount: number;
  fromRubricMarks: number;
  toRubricMarks: number;
  fromTopicKeys: string[];
  toTopicKeys: string[];
}) {
  const fromByKey = new Map(fromQuestions.map((question) => [question.node_key, question]));
  const toByKey = new Map(toQuestions.map((question) => [question.node_key, question]));
  const allKeys = Array.from(new Set([...fromByKey.keys(), ...toByKey.keys()])).sort(naturalCompare);
  const changedFields = new Set<AssessmentVersionDiffField>();
  const changedQuestionKeys: string[] = [];

  for (const key of allKeys) {
    const from = fromByKey.get(key);
    const to = toByKey.get(key);
    if (!from || !to) {
      changedQuestionKeys.push(key);
      changedFields.add("question_text");
      changedFields.add("marks");
      changedFields.add("response_type");
      continue;
    }
    let changed = false;
    if (from.title !== to.title || from.prompt_html !== to.prompt_html || from.prompt_latex !== to.prompt_latex) {
      changedFields.add("question_text");
      changed = true;
    }
    if (from.marks !== to.marks) {
      changedFields.add("marks");
      changed = true;
    }
    if (from.response_mode !== to.response_mode) {
      changedFields.add("response_type");
      changed = true;
    }
    if (changed) changedQuestionKeys.push(key);
  }

  if (fromRegionCount !== toRegionCount) changedFields.add("source_regions");
  if (fromRubricMarks !== toRubricMarks) changedFields.add("rubrics");
  if (normalizedSet(fromTopicKeys) !== normalizedSet(toTopicKeys)) changedFields.add("topics");

  return {
    changedQuestionKeys,
    changedFields: Array.from(changedFields),
    addedQuestionKeys: allKeys.filter((key) => !fromByKey.has(key)),
    removedQuestionKeys: allKeys.filter((key) => !toByKey.has(key)),
  };
}

function normalizedSet(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort(naturalCompare).join("\u0000");
}

function naturalCompare(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}
