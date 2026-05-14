import type { Mark, QuestionNodeRow } from "@/types/database";

export type MarkingTreeNode = QuestionNodeRow & {
  children: MarkingTreeNode[];
  inferred_parent_id: string | null;
};

export type MarkingTreeTotals = {
  awarded: number;
  max: number;
  markedLeafCount: number;
  markableLeafCount: number;
  explicitMax: number | null;
  hasExplicitTotalMismatch: boolean;
};

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function buildMarkingTree(rows: QuestionNodeRow[]): MarkingTreeNode[] {
  const nodeById = new Map<string, MarkingTreeNode>();
  const parentById = new Map<string, string | null>();
  const keyToId = new Map<string, string>();

  for (const row of rows) {
    const node: MarkingTreeNode = {
      ...row,
      children: [],
      inferred_parent_id: null,
    };
    nodeById.set(row.id, node);
    const canonical = canonicalQuestionKey(row.node_key);
    if (canonical && !keyToId.has(canonical)) keyToId.set(canonical, row.id);
  }

  for (const row of rows) {
    let parentId = row.parent_node_id && nodeById.has(row.parent_node_id) ? row.parent_node_id : null;
    if (!parentId) {
      parentId = inferParentId(row, keyToId, nodeById);
      if (parentId) nodeById.get(row.id)!.inferred_parent_id = parentId;
    }
    parentById.set(row.id, parentId && parentId !== row.id ? parentId : null);
  }

  const roots: MarkingTreeNode[] = [];
  for (const row of rows) {
    const node = nodeById.get(row.id)!;
    const parentId = parentById.get(row.id);
    const parent = parentId ? nodeById.get(parentId) : null;
    if (parent && !wouldCreateCycle(node.id, parent.id, parentById)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
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
    } else {
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

export function isMarkableMarkingNode(node: MarkingTreeNode | QuestionNodeRow & { children?: unknown[] }): boolean {
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
    const max = childTotals.reduce((sum, total) => sum + total.max, 0);
    const explicitMax = current.marks;
    return {
      awarded,
      max,
      markedLeafCount: childTotals.reduce((sum, total) => sum + total.markedLeafCount, 0),
      markableLeafCount: childTotals.reduce((sum, total) => sum + total.markableLeafCount, 0),
      explicitMax,
      hasExplicitTotalMismatch:
        childTotals.some((total) => total.hasExplicitTotalMismatch) ||
        (typeof explicitMax === "number" && max > 0 && Number(explicitMax) !== max),
    };
  }

  return walk(node);
}

export function canonicalQuestionKey(rawKey: string | null | undefined): string {
  if (!rawKey) return "";
  return rawKey
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.:]+$/g, "")
    .replace(/^(question|problem|q)(\d+)/i, "$2")
    .toLowerCase();
}

function inferParentId(
  row: QuestionNodeRow,
  keyToId: Map<string, string>,
  nodeById: Map<string, MarkingTreeNode>,
): string | null {
  const candidates = parentKeyCandidates(row.node_key);
  for (const candidate of candidates) {
    const parentId = keyToId.get(candidate);
    if (parentId && parentId !== row.id && nodeById.has(parentId)) return parentId;
  }
  return null;
}

function parentKeyCandidates(nodeKey: string): string[] {
  const key = canonicalQuestionKey(nodeKey);
  if (!key) return [];

  const candidates: string[] = [];
  let current = key;
  while (/\([^()]+\)$/.test(current)) {
    current = current.replace(/\([^()]+\)$/, "");
    if (current) candidates.push(current);
  }
  return candidates;
}

function sortTree(nodes: MarkingTreeNode[]) {
  nodes.sort(compareNodes);
  for (const node of nodes) sortTree(node.children);
}

function compareNodes(a: MarkingTreeNode, b: MarkingTreeNode) {
  if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
  const keyCompare = collator.compare(sortableQuestionKey(a.node_key), sortableQuestionKey(b.node_key));
  if (keyCompare !== 0) return keyCompare;
  return collator.compare(a.created_at, b.created_at);
}

function sortableQuestionKey(nodeKey: string) {
  return canonicalQuestionKey(nodeKey)
    .replace(/\(([ivxlcdm]+)\)/gi, (_, roman: string) => `.${romanToNumber(roman).toString().padStart(4, "0")}`)
    .replace(/\(([a-z])\)/gi, (_, letter: string) => `.${letter.toLowerCase().charCodeAt(0) - 96}`)
    .replace(/[()]/g, ".");
}

function romanToNumber(raw: string) {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const chars = raw.toLowerCase().split("");
  let total = 0;
  for (let index = 0; index < chars.length; index += 1) {
    const current = values[chars[index]!] ?? 0;
    const next = values[chars[index + 1]!] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
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
