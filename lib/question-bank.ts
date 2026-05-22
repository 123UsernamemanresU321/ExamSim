import { buildMarkingTree, computeMarkingTotals, flattenMarkingTree, getSelectableMarkingGroups, type MarkingTreeNode } from "@/lib/marking-tree";
import { compareOrdinalPaths, formatQuestionKeyFromOrdinalPath } from "@/lib/question-hierarchy";
import type { Assessment, AssessmentVersion, MarkschemeNode, QuestionBankChild, QuestionBankItem, QuestionNodeRow } from "@/types/database";

export type QuestionBankDraftItem = {
  root: MarkingTreeNode;
  children: MarkingTreeNode[];
  title: string;
  rootNodeKey: string;
  marksAvailable: number | null;
  hasVisualAssets: boolean;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  sourceObjectPath: string | null;
  markschemeHtml: string | null;
};

export type PaperGenerationCriteria = {
  subject?: string | null;
  topicTags?: string[];
  targetMarks?: number | null;
  difficultyMin?: number | null;
  difficultyMax?: number | null;
  includeVisualQuestions?: boolean;
  avoidQuestionIds?: string[];
};

export type GeneratedPaperSelection = {
  selectedItems: QuestionBankItem[];
  totalMarks: number;
  warnings: string[];
};

export type QuestionBankTreeNode = QuestionBankChild & {
  children: QuestionBankTreeNode[];
  computed_marks_available: number | null;
  mark_source: "direct" | "computed" | "missing";
};

export function extractQuestionBankDrafts({
  assessment,
  version,
  questionNodes,
  markschemeNodes = [],
}: {
  assessment: Pick<Assessment, "title" | "paper_code" | "assessment_kind" | "subject">;
  version: Pick<AssessmentVersion, "source_object_path">;
  questionNodes: QuestionNodeRow[];
  markschemeNodes?: Pick<MarkschemeNode, "mapped_question_node_id" | "markscheme_html">[];
}): QuestionBankDraftItem[] {
  const tree = buildMarkingTree(questionNodes);
  const roots = getSelectableMarkingGroups(tree);
  const markschemeByQuestionId = new Map(markschemeNodes.filter((node) => node.mapped_question_node_id).map((node) => [node.mapped_question_node_id!, node.markscheme_html ?? null]));

  return roots.map((root) => {
    const descendants = flattenMarkingTree(root.children);
    const total = computeMarkingTotals(root, []);
    const markschemeHtml = [markschemeByQuestionId.get(root.id), ...descendants.map((child) => markschemeByQuestionId.get(child.id))]
      .filter(Boolean)
      .join("\n<hr />\n") || root.markscheme_html;
    return {
      root,
      children: descendants,
      title: root.title ?? `${assessment.title} ${root.node_key}`,
      rootNodeKey: root.node_key,
      marksAvailable: total.max || root.marks,
      hasVisualAssets: Boolean(root.has_visual_assets || descendants.some((child) => child.has_visual_assets)),
      sourcePageStart: root.source_page_start,
      sourcePageEnd: root.source_page_end,
      sourceObjectPath: version.source_object_path,
      markschemeHtml: markschemeHtml || null,
    };
  });
}

export function selectQuestionBankItems(items: QuestionBankItem[], criteria: PaperGenerationCriteria): GeneratedPaperSelection {
  const avoidIds = new Set(criteria.avoidQuestionIds ?? []);
  const targetMarks = Number(criteria.targetMarks ?? 0);
  const candidates = items
    .filter((item) => !item.do_not_reuse)
    .filter((item) => !avoidIds.has(item.id))
    .filter((item) => !criteria.subject || item.subject === criteria.subject)
    .filter((item) => criteria.includeVisualQuestions !== false || !item.has_visual_assets)
    .filter((item) => criteria.difficultyMin == null || item.estimated_difficulty == null || item.estimated_difficulty >= criteria.difficultyMin)
    .filter((item) => criteria.difficultyMax == null || item.estimated_difficulty == null || item.estimated_difficulty <= criteria.difficultyMax)
    .filter((item) => {
      const topicTags = criteria.topicTags ?? [];
      if (!topicTags.length) return true;
      return topicTags.some((tag) => item.tags.includes(tag) || item.topic_tag_ids.includes(tag));
    })
    .sort((a, b) => rankItem(b, criteria) - rankItem(a, criteria));

  const selectedItems: QuestionBankItem[] = [];
  let totalMarks = 0;
  for (const candidate of candidates) {
    if (targetMarks > 0 && totalMarks >= targetMarks) break;
    selectedItems.push(candidate);
    totalMarks += Number(candidate.marks_available ?? 0);
  }

  const warnings: string[] = [];
  if (!selectedItems.length) warnings.push("No reusable question bank items matched the selected criteria.");
  if (targetMarks > 0 && totalMarks < targetMarks) warnings.push(`Selected ${totalMarks} marks, below the ${targetMarks} mark target.`);
  if (targetMarks > 0 && totalMarks > targetMarks) warnings.push(`Selected ${totalMarks} marks, above the ${targetMarks} mark target.`);

  return { selectedItems, totalMarks, warnings };
}

export function buildQuestionBankChildTree(children: QuestionBankChild[]): QuestionBankTreeNode[] {
  const byKey = new Map<string, QuestionBankTreeNode>();
  for (const child of children) {
    byKey.set(child.node_key, {
      ...child,
      children: [],
      computed_marks_available: child.marks_available,
      mark_source: child.marks_available == null ? "missing" : "direct",
    });
  }

  const roots: QuestionBankTreeNode[] = [];
  for (const node of byKey.values()) {
    const inferredParentKey = parentKeyForBankChild(node);
    const parent = inferredParentKey ? byKey.get(inferredParentKey) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  sortQuestionBankTree(roots);
  for (const root of roots) calculateQuestionBankTreeMarks(root);
  return roots;
}

function parentKeyForBankChild(node: QuestionBankTreeNode) {
  if (node.parent_node_key && node.parent_node_key.length < 30) return node.parent_node_key;
  if (node.ordinal_path.length <= 2) return null;
  return formatQuestionKeyFromOrdinalPath(node.ordinal_path.slice(0, -1));
}

export function flattenQuestionBankTree(nodes: QuestionBankTreeNode[]): QuestionBankTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenQuestionBankTree(node.children)]);
}

export function calculateQuestionBankRootMarks(item: Pick<QuestionBankItem, "marks_available">, children: QuestionBankTreeNode[]) {
  const childTotal = children.reduce((sum, child) => sum + Number(child.computed_marks_available ?? 0), 0);
  if (childTotal > 0) return { value: childTotal, source: "computed" as const };
  if (item.marks_available != null) return { value: item.marks_available, source: "direct" as const };
  return { value: null, source: "missing" as const };
}

function sortQuestionBankTree(nodes: QuestionBankTreeNode[]) {
  nodes.sort((a, b) => compareOrdinalPaths(a.ordinal_path, b.ordinal_path));
  for (const node of nodes) sortQuestionBankTree(node.children);
}

function calculateQuestionBankTreeMarks(node: QuestionBankTreeNode): number | null {
  if (!node.children.length) {
    node.computed_marks_available = node.marks_available;
    node.mark_source = node.marks_available == null ? "missing" : "direct";
    return node.computed_marks_available;
  }
  const childTotal = node.children.reduce((sum, child) => sum + Number(calculateQuestionBankTreeMarks(child) ?? 0), 0);
  node.computed_marks_available = childTotal > 0 ? childTotal : node.marks_available;
  node.mark_source = childTotal > 0 ? "computed" : node.marks_available == null ? "missing" : "direct";
  return node.computed_marks_available;
}

function rankItem(item: QuestionBankItem, criteria: PaperGenerationCriteria) {
  const topicTags = criteria.topicTags ?? [];
  const topicScore = topicTags.filter((tag) => item.tags.includes(tag) || item.topic_tag_ids.includes(tag)).length * 20;
  const markScore = Number(item.marks_available ?? 0);
  const difficultyScore = item.estimated_difficulty ? 6 - Math.abs(item.estimated_difficulty - 3) : 2;
  const visualPenalty = criteria.includeVisualQuestions === false && item.has_visual_assets ? -50 : 0;
  return topicScore + markScore + difficultyScore + visualPenalty;
}
