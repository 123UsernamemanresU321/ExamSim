import type { AttemptReviewWorkspace } from "@/lib/live-data";
import {
  buildMarkingTree,
  calculateAttemptTotal,
  computeMarkingTotals,
  findMarkingTreeNode,
  getMarkableLeafNodes,
  getSelectableMarkingGroups,
  type MarkingTreeNode,
} from "@/lib/marking-tree";
import { detectVisualDependency } from "@/lib/question-hierarchy";
import type { AttemptAccommodation, AttemptIncident, MistakeCategory, MistakeInstance, TopicTag } from "@/types/database";

export type RootQuestionMarkingContext = {
  attempt: AttemptReviewWorkspace["attempt"];
  student: { display_name: string } | null;
  assessment: { title: string; paper_code: string | null } | null;
  assessmentVersion: { id: string } | null;
  rootQuestion: MarkingTreeNode | null;
  questionTree: MarkingTreeNode[];
  preorderNodes: MarkingTreeNode[];
  markableLeafNodes: MarkingTreeNode[];
  computedParentNodes: MarkingTreeNode[];
  sourcePageRanges: Array<{ node_key: string; start: number | null; end: number | null }>;
  sourcePdfPreview: { object_path: string | null; page_start: number | null; page_end: number | null };
  visualWarnings: string[];
  uploadSlot: AttemptReviewWorkspace["uploadSlots"][number] | null;
  uploadSanityCheck: AttemptReviewWorkspace["uploadSanityChecks"][number] | null;
  studentResponse: AttemptReviewWorkspace["textResponses"];
  annotationDocument: AttemptReviewWorkspace["workAnnotations"];
  latestAnnotationDraft: AttemptReviewWorkspace["workAnnotations"][number] | null;
  releasedAnnotationVersion: AttemptReviewWorkspace["uploadSlots"][number] | null;
  markschemeTree: string | null;
  mappedMarkschemeNodes: Array<{ node_key: string; html: string | null }>;
  unmatchedMarkschemeWarnings: string[];
  marks: AttemptReviewWorkspace["marks"];
  comments: AttemptReviewWorkspace["annotations"];
  commentBankSuggestions: AttemptReviewWorkspace["commentBank"];
  topicTags: TopicTag[];
  mistakeTaxonomyItems: MistakeCategory[];
  mistakeInstances: MistakeInstance[];
  moderationSummary: AttemptReviewWorkspace["moderationReport"];
  moderationTimeline: AttemptReviewWorkspace["attemptEvents"];
  incidents: AttemptIncident[];
  accommodations: AttemptAccommodation[];
  feedbackReleaseState: AttemptReviewWorkspace["feedbackRelease"];
  receipt: null;
  permissions: { canMark: boolean; canAnnotate: boolean; canReleaseFeedback: boolean };
  totals: {
    root: ReturnType<typeof computeMarkingTotals> | null;
    attempt: ReturnType<typeof calculateAttemptTotal>;
  };
};

export function buildRootQuestionMarkingContext(
  workspace: AttemptReviewWorkspace,
  rootQuestionNodeId?: string | null,
  extras: {
    incidents?: AttemptIncident[];
    accommodations?: AttemptAccommodation[];
    mistakeCategories?: MistakeCategory[];
    mistakeInstances?: MistakeInstance[];
    topicTags?: TopicTag[];
  } = {},
): RootQuestionMarkingContext {
  const questionTree = buildMarkingTree(workspace.questionNodes);
  const rootQuestions = getSelectableMarkingGroups(questionTree);
  const rootQuestion = (rootQuestionNodeId ? findMarkingTreeNode(rootQuestions, rootQuestionNodeId) : rootQuestions[0]) ?? null;
  const preorderNodes = rootQuestion ? [rootQuestion, ...rootQuestion.children.flatMap(flatten)] : [];
  const markableLeafNodes = rootQuestion ? getMarkableLeafNodes(rootQuestion) : [];
  const computedParentNodes = preorderNodes.filter((node) => node.children.length > 0);
  const rootIds = new Set(preorderNodes.map((node) => node.id));
  const sourcePageRanges = preorderNodes.map((node) => ({
    node_key: node.node_key,
    start: node.source_page_start,
    end: node.source_page_end,
  }));
  const visualWarnings = preorderNodes
    .filter((node) => detectVisualDependency(node.prompt_html, node.prompt_latex) && !node.has_visual_assets && !node.source_page_start)
    .map((node) => `${node.node_key} may depend on a diagram, graph, table, or figure, but no source page is attached.`);
  const uploadSlot = rootQuestion ? workspace.uploadSlots.find((slot) => slot.question_node_id === rootQuestion.id) ?? null : null;
  const uploadSanityCheck = uploadSlot
    ? workspace.uploadSanityChecks.find((check) => check.upload_slot_id === uploadSlot.id) ?? null
    : null;
  const annotationDocument = workspace.workAnnotations.filter((annotation) => rootIds.has(annotation.question_node_id));
  const latestAnnotationDraft = [...annotationDocument].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  const studentResponse = workspace.textResponses.filter((response) => rootIds.has(response.question_node_id));
  const mappedMarkschemeNodes = preorderNodes
    .map((node) => ({ node_key: node.node_key, html: node.markscheme_html }))
    .filter((node) => Boolean(node.html));
  const unmatchedMarkschemeWarnings = workspace.markschemeHtml && !mappedMarkschemeNodes.length ? ["A markscheme exists, but no sections are mapped to this root question."] : [];

  return {
    attempt: workspace.attempt,
    student: workspace.attempt ? { display_name: workspace.attempt.student } : null,
    assessment: workspace.attempt ? { title: workspace.attempt.title, paper_code: workspace.attempt.paper_code } : null,
    assessmentVersion: workspace.questionNodes[0]?.assessment_version_id ? { id: workspace.questionNodes[0].assessment_version_id } : null,
    rootQuestion,
    questionTree,
    preorderNodes,
    markableLeafNodes,
    computedParentNodes,
    sourcePageRanges,
    sourcePdfPreview: {
      object_path: workspace.sourceObjectPath,
      page_start: rootQuestion?.source_page_start ?? null,
      page_end: rootQuestion?.source_page_end ?? null,
    },
    visualWarnings,
    uploadSlot,
    uploadSanityCheck,
    studentResponse,
    annotationDocument,
    latestAnnotationDraft,
    releasedAnnotationVersion: uploadSlot?.annotated_object_path ? uploadSlot : null,
    markschemeTree: workspace.markschemeHtml,
    mappedMarkschemeNodes,
    unmatchedMarkschemeWarnings,
    marks: workspace.marks.filter((mark) => !mark.question_node_id || rootIds.has(mark.question_node_id)),
    comments: workspace.annotations.filter((annotation) => !annotation.question_node_id || rootIds.has(annotation.question_node_id)),
    commentBankSuggestions: workspace.commentBank,
    topicTags: extras.topicTags ?? [],
    mistakeTaxonomyItems: extras.mistakeCategories ?? [],
    mistakeInstances: (extras.mistakeInstances ?? []).filter((instance) => rootIds.has(instance.question_node_id)),
    moderationSummary: workspace.moderationReport,
    moderationTimeline: workspace.attemptEvents,
    incidents: extras.incidents ?? [],
    accommodations: extras.accommodations ?? [],
    feedbackReleaseState: workspace.feedbackRelease,
    receipt: null,
    permissions: { canMark: true, canAnnotate: true, canReleaseFeedback: true },
    totals: {
      root: rootQuestion ? computeMarkingTotals(rootQuestion, workspace.marks) : null,
      attempt: calculateAttemptTotal(questionTree, workspace.marks),
    },
  };
}

function flatten(node: MarkingTreeNode): MarkingTreeNode[] {
  return [node, ...node.children.flatMap(flatten)];
}
