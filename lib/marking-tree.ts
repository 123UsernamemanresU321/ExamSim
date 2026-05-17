import type { Mark, QuestionNodeRow } from "@/types/database";
import {
  canonicalQuestionKey,
  compareOrdinalPaths,
  compareQuestionLike,
  formatQuestionDisplayLabel,
  formatQuestionKeyFromOrdinalPath,
  parentPathForOrdinalPath,
  resolvedOrdinalPath,
} from "@/lib/question-hierarchy";

export type QuestionHierarchyFields = {
  root_question_id?: string | null;
  display_label?: string | null;
  depth?: number | null;
  ordinal_path?: number[] | null;
  sort_key?: string | null;
  mark_mode?: "manual" | "computed" | null;
  source_region_json?: unknown;
  has_visual_assets?: boolean | null;
  visual_asset_refs?: string[] | null;
};

export type MarkingTreeNode = QuestionNodeRow &
  QuestionHierarchyFields & {
    children: MarkingTreeNode[];
    inferred_parent_id: string | null;
    synthetic?: boolean;
    ordinal_path_resolved: number[];
    depth_resolved: number;
    root_question_id_resolved: string;
  };

export type MarkingTreeTotals = {
  awarded: number;
  max: number;
  markedLeafCount: number;
  markableLeafCount: number;
  explicitMax: number | null;
  hasExplicitTotalMismatch: boolean;
};

export function buildMarkingTree(rows: QuestionNodeRow[]): MarkingTreeNode[] {
  const nodeById = new Map<string, MarkingTreeNode>();
  const keyToId = new Map<string, string>();

  rows.forEach((row, index) => {
    const node = createTreeNode(row, index);
    nodeById.set(node.id, node);
    const canonical = canonicalQuestionKey(node.node_key);
    if (canonical && !keyToId.has(canonical)) keyToId.set(canonical, node.id);
  });

  for (const node of [...nodeById.values()]) {
    ensureSyntheticAncestors(node, nodeById, keyToId);
  }

  const parentById = new Map<string, string | null>();
  for (const node of nodeById.values()) {
    const explicitParentId = node.parent_node_id && nodeById.has(node.parent_node_id) ? node.parent_node_id : null;
    const inferredParentId = explicitParentId ?? inferParentId(node, keyToId);
    if (!explicitParentId && inferredParentId) node.inferred_parent_id = inferredParentId;
    parentById.set(node.id, inferredParentId && inferredParentId !== node.id ? inferredParentId : null);
  }

  const roots: MarkingTreeNode[] = [];
  for (const node of nodeById.values()) {
    const parentId = parentById.get(node.id);
    const parent = parentId ? nodeById.get(parentId) : null;
    if (parent && !wouldCreateCycle(node.id, parent.id, parentById)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of nodeById.values()) {
    node.root_question_id_resolved = resolveRootQuestionId(node, parentById, nodeById);
    node.depth_resolved = computeDepth(node.id, parentById);
  }

  sortTree(roots);
  return roots;
}

export function flattenMarkingTree(nodes: MarkingTreeNode[]): MarkingTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenMarkingTree(node.children)]);
}

export function getSelectableMarkingGroups(nodes: MarkingTreeNode[]): MarkingTreeNode[] {
  const groups: MarkingTreeNode[] = [];
  for (const node of nodes) {
    if (node.node_type === "section") {
      groups.push(...getSelectableMarkingGroups(node.children));
    } else if (isRootQuestion(node) || node.depth_resolved === 0) {
      groups.push(node);
    }
  }
  return groups;
}

export function findMarkingTreeNode(nodes: MarkingTreeNode[], id: string | null): MarkingTreeNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findMarkingTreeNode(node.children, id);
    if (child) return child;
  }
  return null;
}

export function findSelectableGroupForNode(nodes: MarkingTreeNode[], nodeId: string): MarkingTreeNode | null {
  for (const root of getSelectableMarkingGroups(nodes)) {
    if (root.id === nodeId) return root;
    if (findMarkingTreeNode(root.children, nodeId)) return root;
  }
  return null;
}

export function isRootQuestion(node: MarkingTreeNode | (QuestionNodeRow & QuestionHierarchyFields)): boolean {
  const path = Array.isArray(node.ordinal_path) ? node.ordinal_path : resolvedOrdinalPath(node);
  return node.node_type === "question" && path.length <= 1;
}

export function isLeafQuestion(node: MarkingTreeNode | (QuestionNodeRow & { children?: unknown[] })): boolean {
  return !Array.isArray(node.children) || node.children.length === 0;
}

export function isMarkableMarkingNode(node: MarkingTreeNode | (QuestionNodeRow & { children?: unknown[] })): boolean {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  return !hasChildren && node.node_type !== "section" && node.response_mode !== "none";
}

export function getMarkableLeafNodes(node: MarkingTreeNode): MarkingTreeNode[] {
  if (isMarkableMarkingNode(node)) return [node];
  return node.children.flatMap(getMarkableLeafNodes);
}

export function computeMarkingTotals(node: MarkingTreeNode, marks: Pick<Mark, "question_node_id" | "awarded_marks">[]): MarkingTreeTotals {
  const markByNodeId = new Map(marks.filter((mark) => mark.question_node_id).map((mark) => [mark.question_node_id!, mark]));

  function walk(current: MarkingTreeNode): MarkingTreeTotals {
    if (isMarkableMarkingNode(current)) {
      const savedMark = markByNodeId.get(current.id);
      return {
        awarded: Number(savedMark?.awarded_marks ?? 0),
        max: Number(current.marks ?? 0),
        markedLeafCount: savedMark ? 1 : 0,
        markableLeafCount: 1,
        explicitMax: current.marks,
        hasExplicitTotalMismatch: false,
      };
    }

    const childTotals = current.children.map(walk);
    const awarded = childTotals.reduce((sum, total) => sum + total.awarded, 0);
    const childMax = childTotals.reduce((sum, total) => sum + total.max, 0);
    const explicitMax = current.marks;
    const max = childMax > 0 ? childMax : Number(explicitMax ?? 0);

    return {
      awarded,
      max,
      markedLeafCount: childTotals.reduce((sum, total) => sum + total.markedLeafCount, 0),
      markableLeafCount: childTotals.reduce((sum, total) => sum + total.markableLeafCount, 0),
      explicitMax,
      hasExplicitTotalMismatch:
        childTotals.some((total) => total.hasExplicitTotalMismatch) ||
        (typeof explicitMax === "number" && childMax > 0 && Number(explicitMax) !== childMax),
    };
  }

  return walk(node);
}

export function calculateNodeMarks(node: MarkingTreeNode, marks: Pick<Mark, "question_node_id" | "awarded_marks">[]): MarkingTreeTotals {
  return computeMarkingTotals(node, marks);
}

export function calculateAttemptTotal(rootNodes: MarkingTreeNode[], marks: Pick<Mark, "question_node_id" | "awarded_marks">[]): MarkingTreeTotals {
  const rootTotals = getSelectableMarkingGroups(rootNodes).map((node) => computeMarkingTotals(node, marks));
  return {
    awarded: rootTotals.reduce((sum, total) => sum + total.awarded, 0),
    max: rootTotals.reduce((sum, total) => sum + total.max, 0),
    markedLeafCount: rootTotals.reduce((sum, total) => sum + total.markedLeafCount, 0),
    markableLeafCount: rootTotals.reduce((sum, total) => sum + total.markableLeafCount, 0),
    explicitMax: null,
    hasExplicitTotalMismatch: rootTotals.some((total) => total.hasExplicitTotalMismatch),
  };
}

export { canonicalQuestionKey };

function createTreeNode(row: QuestionNodeRow, index: number): MarkingTreeNode {
  const extra = row as QuestionNodeRow & QuestionHierarchyFields;
  const path = resolvedOrdinalPath(extra, index);
  return {
    ...row,
    display_label: extra.display_label ?? formatQuestionDisplayLabel(path),
    root_question_id: extra.root_question_id ?? null,
    depth: extra.depth ?? path.length - 1,
    ordinal_path: extra.ordinal_path ?? path,
    sort_key: extra.sort_key ?? path.join("."),
    mark_mode: extra.mark_mode ?? null,
    source_region_json: extra.source_region_json,
    has_visual_assets: extra.has_visual_assets ?? Boolean((row.assets ?? []).length),
    visual_asset_refs: extra.visual_asset_refs ?? row.assets ?? [],
    children: [],
    inferred_parent_id: null,
    ordinal_path_resolved: path,
    depth_resolved: Math.max(0, path.length - 1),
    root_question_id_resolved: row.id,
  };
}

function createSyntheticNode(path: number[], assessmentVersionId: string): MarkingTreeNode {
  const nodeKey = formatQuestionDisplayLabel(path);
  return {
    id: `synthetic:${assessmentVersionId}:${path.join(".")}`,
    assessment_version_id: assessmentVersionId,
    parent_node_id: null,
    node_key: nodeKey,
    ordinal: path[path.length - 1] ?? 0,
    node_type: path.length === 1 ? "question" : path.length === 2 ? "subquestion" : "part",
    title: path.length === 1 ? `Question ${path[0]}` : null,
    prompt_html: null,
    prompt_latex: null,
    marks: null,
    response_mode: "none",
    interaction_json: null,
    markscheme_html: null,
    assets: [],
    source_page_start: null,
    source_page_end: null,
    created_at: "",
    display_label: nodeKey,
    root_question_id: null,
    depth: path.length - 1,
    ordinal_path: path,
    sort_key: path.join("."),
    mark_mode: "computed",
    has_visual_assets: false,
    visual_asset_refs: [],
    children: [],
    inferred_parent_id: null,
    synthetic: true,
    ordinal_path_resolved: path,
    depth_resolved: path.length - 1,
    root_question_id_resolved: "",
  };
}

function ensureSyntheticAncestors(
  node: MarkingTreeNode,
  nodeById: Map<string, MarkingTreeNode>,
  keyToId: Map<string, string>,
) {
  const path = node.ordinal_path_resolved;
  if (path.length <= 1) return;

  for (let depth = 1; depth < path.length; depth += 1) {
    const ancestorPath = path.slice(0, depth);
    const canonical = canonicalQuestionKey(formatQuestionKeyFromOrdinalPath(ancestorPath));
    if (!canonical || keyToId.has(canonical)) continue;

    const synthetic = createSyntheticNode(ancestorPath, node.assessment_version_id);
    nodeById.set(synthetic.id, synthetic);
    keyToId.set(canonical, synthetic.id);
  }
}

function inferParentId(node: MarkingTreeNode, keyToId: Map<string, string>): string | null {
  const parentPath = parentPathForOrdinalPath(node.ordinal_path_resolved);
  if (parentPath) {
    const parentId = keyToId.get(canonicalQuestionKey(formatQuestionKeyFromOrdinalPath(parentPath)));
    if (parentId && parentId !== node.id) return parentId;
  }

  let current = canonicalQuestionKey(node.node_key);
  while (/\([^()]+\)$/.test(current)) {
    current = current.replace(/\([^()]+\)$/, "");
    const parentId = keyToId.get(current);
    if (parentId && parentId !== node.id) return parentId;
  }

  return null;
}

function sortTree(nodes: MarkingTreeNode[]) {
  nodes.sort(compareNodes);
  for (const node of nodes) sortTree(node.children);
}

function compareNodes(a: MarkingTreeNode, b: MarkingTreeNode) {
  const pathCompare = compareOrdinalPaths(a.ordinal_path_resolved, b.ordinal_path_resolved);
  if (pathCompare !== 0) return pathCompare;
  const questionCompare = compareQuestionLike(a, b);
  if (questionCompare !== 0) return questionCompare;
  return a.created_at.localeCompare(b.created_at);
}

function resolveRootQuestionId(
  node: MarkingTreeNode,
  parentById: Map<string, string | null>,
  nodeById: Map<string, MarkingTreeNode>,
): string {
  let current: MarkingTreeNode | undefined = node;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) return node.id;
    seen.add(current.id);
    const parentId = parentById.get(current.id);
    if (!parentId) return current.id;
    current = nodeById.get(parentId);
  }
  return node.id;
}

function computeDepth(nodeId: string, parentById: Map<string, string | null>) {
  let depth = 0;
  let current = parentById.get(nodeId);
  const seen = new Set<string>([nodeId]);
  while (current && !seen.has(current)) {
    depth += 1;
    seen.add(current);
    current = parentById.get(current);
  }
  return depth;
}

function wouldCreateCycle(nodeId: string, parentId: string, parentById: Map<string, string | null>) {
  let current: string | null | undefined = parentId;
  const seen = new Set<string>([nodeId]);
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentById.get(current);
  }
  return false;
}
