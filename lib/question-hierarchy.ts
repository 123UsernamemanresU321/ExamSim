export type DocumentSectionType =
  | "cover"
  | "instructions"
  | "formula_sheet"
  | "contents"
  | "question_page"
  | "markscheme_cover"
  | "markscheme_instructions"
  | "markscheme_question_page"
  | "unknown";

export type HierarchyKeyLike = {
  node_key: string;
  ordinal?: number | null;
  ordinal_path?: number[] | null;
  source_page_start?: number | null;
};

export type ParsedQuestionNodeKey = {
  raw_key: string;
  normalized_key: string;
  display_label: string;
  parent_node_key: string | null;
  root_question_key: string;
  depth: number;
  ordinal_path: number[];
  node_type: "question" | "subquestion" | "part";
};

export type RawQuestionHierarchyNode = {
  node_id?: string | null;
  node_key?: string | null;
  normalized_key?: string | null;
  display_label?: string | null;
  parent_node_key?: string | null;
  root_question_key?: string | null;
  depth?: number | null;
  ordinal_path?: number[] | null;
  ordinal?: number | null;
  node_type?: "section" | "question" | "subquestion" | "part" | string | null;
  title?: string | null;
  prompt_html?: string | null;
  prompt_latex?: string | null;
  prompt?: { html?: string | null; latex?: string | null } | null;
  marks?: number | null;
  marks_available?: number | null;
  mark_mode?: "manual" | "computed" | null;
  response_mode?: "none" | "upload_pdf" | "typed_text" | "typed_or_upload" | "multiple_choice" | "numerical" | string | null;
  interaction_json?: object | null;
  interaction?: object | null;
  markscheme_html?: string | null;
  assets?: unknown[] | null;
  source_page_start?: number | null;
  source_page_end?: number | null;
  source_region_json?: object | null;
  has_visual_assets?: boolean | null;
  visual_asset_refs?: unknown[] | null;
  children?: RawQuestionHierarchyNode[] | null;
};

export type NormalizedQuestionHierarchyNode = {
  node_id: string;
  node_key: string;
  normalized_key: string;
  display_label: string;
  parent_node_key: string | null;
  root_question_key: string;
  depth: number;
  ordinal_path: number[];
  ordinal: number;
  node_type: "question" | "subquestion" | "part" | "section";
  title: string | null;
  prompt_html: string | null;
  prompt_latex: string | null;
  marks: number | null;
  marks_available: number | null;
  mark_mode: "manual" | "computed";
  response_mode: "none" | "upload_pdf" | "typed_text" | "typed_or_upload" | "multiple_choice" | "numerical";
  interaction_json: object | null;
  markscheme_html: string | null;
  assets: string[];
  source_page_start: number | null;
  source_page_end: number | null;
  source_region_json: object | null;
  has_visual_assets: boolean;
  visual_asset_refs: Array<object | string> | null;
  synthetic?: boolean;
  children: NormalizedQuestionHierarchyNode[];
};

export type NormalizedQuestionTreeResult = {
  tree: NormalizedQuestionHierarchyNode[];
  flat: NormalizedQuestionHierarchyNode[];
  warnings: string[];
  confidence: number;
};

export type QuestionTreeValidationIssue = {
  severity: "blocked" | "warning";
  code:
    | "empty_tree"
    | "orphan_parent"
    | "duplicate_key"
    | "missing_page_range"
    | "visual_dependency_without_source"
    | "invalid_order"
    | "front_matter_question"
    | "marks_missing";
  message: string;
  node_key?: string;
};

export function canonicalQuestionKey(rawKey: string | null | undefined): string {
  if (!rawKey) return "";
  return rawKey
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.:]+$/g, "")
    .replace(/^(question|problem|q)(\d+)/i, "$2")
    .replace(/^question/i, "")
    .replace(/^problem/i, "")
    .replace(/^q(?=\d)/i, "")
    .replace(/^(\d+)[.)]?([a-z])$/i, "$1($2)")
    .replace(/^(\d+)\.([a-z])$/i, "$1($2)")
    .toLowerCase();
}

export function normalizeNodeKey(rawKey: string | null | undefined): string {
  const parsed = parseNodeKey(rawKey);
  return parsed?.normalized_key ?? "";
}

export function parseNodeKey(rawKey: string | null | undefined, fallbackOrdinal?: number | null): ParsedQuestionNodeKey | null {
  const path = ordinalPathForQuestionKey(rawKey, fallbackOrdinal);
  if (!path.length) return null;
  const normalizedKey = path.length === 1 ? `Q${path[0]}` : formatQuestionKeyFromOrdinalPath(path);
  const rootQuestionKey = `Q${path[0]}`;
  return {
    raw_key: rawKey ?? "",
    normalized_key: normalizedKey,
    display_label: formatQuestionDisplayLabel(path),
    parent_node_key: path.length > 1 ? buildParentKey(path) : null,
    root_question_key: rootQuestionKey,
    depth: path.length - 1,
    ordinal_path: path,
    node_type: path.length === 1 ? "question" : path.length === 2 ? "subquestion" : "part",
  };
}

export function ordinalPathForQuestionKey(rawKey: string | null | undefined, fallbackOrdinal?: number | null): number[] {
  const key = canonicalQuestionKey(rawKey);
  const rootMatch = key.match(/^(\d+)/);
  const path: number[] = [];

  if (rootMatch) {
    path.push(Number(rootMatch[1]));
    const partMatches = [...key.matchAll(/\(([^()]+)\)/g)];
    partMatches.forEach((match, index) => {
      path.push(questionPartTokenToOrdinal(match[1] ?? "", index + 1));
    });
  }

  if (!path.length && typeof fallbackOrdinal === "number" && Number.isFinite(fallbackOrdinal)) {
    path.push(Math.max(0, fallbackOrdinal));
  }

  return path;
}

export function resolvedOrdinalPath(node: HierarchyKeyLike, fallbackIndex = 0): number[] {
  if (Array.isArray(node.ordinal_path) && node.ordinal_path.every((part) => Number.isFinite(part))) {
    return node.ordinal_path.map((part) => Math.trunc(part));
  }
  const parsed = ordinalPathForQuestionKey(node.node_key, node.ordinal ?? fallbackIndex + 1);
  return parsed.length ? parsed : [fallbackIndex + 1];
}

export function compareOrdinalPaths(a: number[], b: number[]): number {
  const maxLength = Math.max(a.length, b.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left !== right) return left - right;
  }
  return 0;
}

export const compareOrdinalPath = compareOrdinalPaths;

export function compareQuestionLike(a: HierarchyKeyLike, b: HierarchyKeyLike): number {
  const pathCompare = compareOrdinalPaths(resolvedOrdinalPath(a), resolvedOrdinalPath(b));
  if (pathCompare !== 0) return pathCompare;

  const pageA = a.source_page_start ?? Number.MAX_SAFE_INTEGER;
  const pageB = b.source_page_start ?? Number.MAX_SAFE_INTEGER;
  if (pageA !== pageB) return pageA - pageB;

  return canonicalQuestionKey(a.node_key).localeCompare(canonicalQuestionKey(b.node_key), "en", {
    numeric: true,
    sensitivity: "base",
  });
}

export function parentPathForOrdinalPath(path: number[]): number[] | null {
  return path.length > 1 ? path.slice(0, -1) : null;
}

export function formatQuestionKeyFromOrdinalPath(path: number[]): string {
  if (!path.length) return "";
  const [root, ...parts] = path;
  return `${root}${parts.map((part, index) => `(${formatPartOrdinal(part, index + 1)})`).join("")}`;
}

export function formatQuestionDisplayLabel(path: number[]): string {
  if (path.length === 1) return `Q${path[0]}`;
  return formatQuestionKeyFromOrdinalPath(path);
}

export function buildDisplayLabel(value: ParsedQuestionNodeKey | number[] | string): string {
  if (Array.isArray(value)) return formatQuestionDisplayLabel(value);
  if (typeof value === "string") return parseNodeKey(value)?.display_label ?? value;
  return value.display_label;
}

export function buildParentKey(value: ParsedQuestionNodeKey | number[] | string): string | null {
  const path = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parseNodeKey(value)?.ordinal_path ?? []
      : value.ordinal_path;
  if (path.length <= 1) return null;
  const parentPath = path.slice(0, -1);
  return parentPath.length === 1 ? `Q${parentPath[0]}` : formatQuestionKeyFromOrdinalPath(parentPath);
}

export function buildRootQuestionKey(value: ParsedQuestionNodeKey | number[] | string): string {
  const path = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parseNodeKey(value)?.ordinal_path ?? []
      : value.ordinal_path;
  return path.length ? `Q${path[0]}` : "";
}

export function isRootQuestionKey(rawKey: string | null | undefined): boolean {
  return ordinalPathForQuestionKey(rawKey).length === 1;
}

export function classifyDocumentSection(text: string, purpose: "paper" | "markscheme" = "paper"): DocumentSectionType {
  const compact = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!compact) return "unknown";

  const hasQuestionMarker = hasActualQuestionMarker(text);
  const hasMarkschemeMarker = /\b(mark\s*scheme|markscheme|marking\s+instructions?|award\s+marks?|marking\s+notes?)\b/i.test(text);
  const hasFormulaMarker = /\b(formula\s+sheet|formula\s+booklet|formulae|mathematical\s+formulae)\b/i.test(text);
  const hasInstructionMarker = /\b(instructions?\s+to\s+candidates?|do\s+not\s+open|answer\s+all\s+questions|write\s+your\s+answers?|working\s+must\s+be\s+shown|total\s+marks|time\s+allowed)\b/i.test(text);
  const hasCoverMarker = /\b(candidate\s+name|centre\s+number|paper\s+\d|copyright|turn\s+over|international\s+baccalaureate|olympiad|examination)\b/i.test(text);

  if (purpose === "markscheme" || hasMarkschemeMarker) {
    if (hasQuestionMarker && !/\b(general\s+marking|marking\s+instructions?|award\s+marks?\s+according\s+to)\b/i.test(text)) {
      return "markscheme_question_page";
    }
    if (/\b(general\s+marking|marking\s+instructions?|award\s+marks?\s+according\s+to|follow\s+through|method\s+marks?)\b/i.test(text)) {
      return "markscheme_instructions";
    }
    if (hasCoverMarker || /\b(mark\s*scheme|markscheme)\b/i.test(text)) return "markscheme_cover";
  }

  if (hasFormulaMarker) return "formula_sheet";
  if (hasQuestionMarker) return "question_page";
  if (hasInstructionMarker) return "instructions";
  if (/\b(contents|table\s+of\s+contents)\b/i.test(text)) return "contents";
  if (hasCoverMarker) return "cover";
  return "unknown";
}

export function shouldExcludeFromQuestionExtraction(text: string, purpose: "paper" | "markscheme" = "paper"): boolean {
  return new Set<DocumentSectionType>([
    "cover",
    "instructions",
    "formula_sheet",
    "contents",
    "markscheme_cover",
    "markscheme_instructions",
  ]).has(classifyDocumentSection(text, purpose));
}

export function classifyDocumentSections(
  rawSections: Array<string | { text?: string | null; content?: string | null; page_text?: string | null }>,
  purpose: "paper" | "markscheme" = "paper",
): Array<{ type: DocumentSectionType; index: number; reason: string }> {
  return rawSections.map((section, index) => {
    const text = typeof section === "string" ? section : section.text ?? section.content ?? section.page_text ?? "";
    const type = classifyDocumentSection(text, purpose);
    return {
      type,
      index,
      reason: sectionClassificationReason(type),
    };
  });
}

export function classifyMarkschemeSections(
  rawSections: Array<string | { text?: string | null; content?: string | null; page_text?: string | null }>,
) {
  return classifyDocumentSections(rawSections, "markscheme");
}

export function detectVisualDependency(promptHtml?: string | null, promptLatex?: string | null): boolean {
  return /\b(diagram|figure|graph|table|image|shown below|shown in|chart|data booklet|sketch|grid|axes)\b/i.test(
    `${promptHtml ?? ""} ${promptLatex ?? ""}`,
  );
}

export function matchQuestionKey(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = canonicalQuestionKey(a);
  const right = canonicalQuestionKey(b);
  return Boolean(left && right && left === right);
}

export function buildNormalizedQuestionTree(rawNodes: RawQuestionHierarchyNode[]): NormalizedQuestionTreeResult {
  const warnings: string[] = [];
  const flattened = flattenRawHierarchyNodes(rawNodes);
  const byKey = new Map<string, NormalizedQuestionHierarchyNode>();
  const firstSeen = new Map<string, number>();

  flattened.forEach(({ node, index }) => {
    const parsed = parseNodeKey(node.node_key ?? node.normalized_key ?? node.node_id ?? null, node.ordinal ?? index + 1);
    if (!parsed) {
      warnings.push(`Could not parse node key "${node.node_key ?? node.node_id ?? index + 1}"; node was skipped.`);
      return;
    }
    const normalized = rawNodeToNormalized(node, parsed, index);
    const existing = byKey.get(parsed.normalized_key);
    if (existing) {
      byKey.set(parsed.normalized_key, mergeHierarchyNodes(existing, normalized));
      warnings.push(`Duplicate question key "${parsed.normalized_key}" was merged.`);
    } else {
      byKey.set(parsed.normalized_key, normalized);
      firstSeen.set(parsed.normalized_key, index);
    }
  });

  for (const node of [...byKey.values()]) {
    for (let depth = 1; depth < node.ordinal_path.length; depth += 1) {
      const ancestorPath = node.ordinal_path.slice(0, depth);
      const ancestorKey = depth === 1 ? `Q${ancestorPath[0]}` : formatQuestionKeyFromOrdinalPath(ancestorPath);
      if (byKey.has(ancestorKey)) continue;
      byKey.set(ancestorKey, createSyntheticHierarchyNode(ancestorPath, node.node_id));
      firstSeen.set(ancestorKey, Number.MAX_SAFE_INTEGER - depth);
      warnings.push(`Created missing parent "${ancestorKey}" for "${node.node_key}".`);
    }
  }

  const nodes = [...byKey.values()].sort((a, b) => {
    const pathCompare = compareOrdinalPaths(a.ordinal_path, b.ordinal_path);
    if (pathCompare !== 0) return pathCompare;
    return (firstSeen.get(a.normalized_key) ?? 0) - (firstSeen.get(b.normalized_key) ?? 0);
  });

  const nodeMap = new Map(nodes.map((node) => [node.normalized_key, { ...node, children: [] as NormalizedQuestionHierarchyNode[] }]));
  const roots: NormalizedQuestionHierarchyNode[] = [];

  for (const node of nodeMap.values()) {
    node.parent_node_key = buildParentKey(node.ordinal_path);
    node.root_question_key = buildRootQuestionKey(node.ordinal_path);
    node.depth = node.ordinal_path.length - 1;
    node.node_type = node.depth === 0 ? "question" : node.depth === 1 ? "subquestion" : "part";
    node.display_label = formatQuestionDisplayLabel(node.ordinal_path);
    node.ordinal = node.ordinal_path[node.ordinal_path.length - 1] ?? node.ordinal;

    const parent = node.parent_node_key ? nodeMap.get(node.parent_node_key) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  sortNormalizedTree(roots);
  for (const root of roots) finalizeHierarchyNode(root);
  const flat = roots.flatMap(flattenNormalizedTree);
  const confidence = Math.max(0, Math.min(1, 1 - warnings.length * 0.03));
  return { tree: roots, flat, warnings, confidence };
}

export function createMissingParents(rawNodes: RawQuestionHierarchyNode[]): NormalizedQuestionHierarchyNode[] {
  return buildNormalizedQuestionTree(rawNodes).flat.filter((node) => node.synthetic);
}

export function mergeDuplicateNodes(rawNodes: RawQuestionHierarchyNode[]): NormalizedQuestionHierarchyNode[] {
  return buildNormalizedQuestionTree(rawNodes).flat;
}

export function repairFlatParserOutput(rawNodes: RawQuestionHierarchyNode[]): NormalizedQuestionTreeResult {
  return buildNormalizedQuestionTree(rawNodes);
}

export function buildQuestionTree(rawNodes: RawQuestionHierarchyNode[] | NormalizedQuestionHierarchyNode[]): NormalizedQuestionHierarchyNode[] {
  return buildNormalizedQuestionTree(rawNodes).tree;
}

export function flattenQuestionTreePreorder(tree: NormalizedQuestionHierarchyNode[]): NormalizedQuestionHierarchyNode[] {
  return tree.flatMap(flattenNormalizedTree);
}

export function validateQuestionTree(tree: NormalizedQuestionHierarchyNode[]): QuestionTreeValidationIssue[] {
  const issues: QuestionTreeValidationIssue[] = [];
  if (!tree.length) {
    issues.push({ severity: "blocked", code: "empty_tree", message: "No root questions were detected." });
    return issues;
  }

  const flat = flattenQuestionTreePreorder(tree);
  const seen = new Set<string>();
  let previousPath: number[] | null = null;
  for (const node of flat) {
    if (seen.has(node.normalized_key)) {
      issues.push({
        severity: "blocked",
        code: "duplicate_key",
        node_key: node.node_key,
        message: `Duplicate question key ${node.node_key} remains after repair.`,
      });
    }
    seen.add(node.normalized_key);

    if (node.parent_node_key && !seen.has(node.parent_node_key)) {
      const parentExistsAnywhere = flat.some((candidate) => candidate.normalized_key === node.parent_node_key);
      if (!parentExistsAnywhere) {
        issues.push({
          severity: "blocked",
          code: "orphan_parent",
          node_key: node.node_key,
          message: `${node.node_key} references missing parent ${node.parent_node_key}.`,
        });
      }
    }

    if (previousPath && compareOrdinalPaths(previousPath, node.ordinal_path) > 0) {
      issues.push({
        severity: "blocked",
        code: "invalid_order",
        node_key: node.node_key,
        message: `${node.node_key} is out of natural question order.`,
      });
    }
    previousPath = node.ordinal_path;

    const hasSourcePageContext = nodeHasSourcePageContext(node);
    if (!hasSourcePageContext) {
      issues.push({
        severity: "warning",
        code: "missing_page_range",
        node_key: node.node_key,
        message: `${node.node_key} does not have a source page range; diagrams or layout context may be missing.`,
      });
    }

    if (detectVisualDependency(node.prompt_html, node.prompt_latex) && !node.has_visual_assets && !hasSourcePageContext) {
      issues.push({
        severity: "warning",
        code: "visual_dependency_without_source",
        node_key: node.node_key,
        message: `${node.node_key} appears to depend on a diagram, graph, table, or figure but has no visual source reference.`,
      });
    }

    if (!node.children.length && node.node_type !== "section" && node.marks_available === null) {
      issues.push({
        severity: "warning",
        code: "marks_missing",
        node_key: node.node_key,
        message: `${node.node_key} is markable but has no marks available.`,
      });
    }
  }

  return issues;
}

function nodeHasSourcePageContext(node: NormalizedQuestionHierarchyNode): boolean {
  if (Boolean(node.source_page_start && node.source_page_end)) return true;
  return node.children.some((child) => nodeHasSourcePageContext(child));
}

export function generateParserWarnings(tree: NormalizedQuestionHierarchyNode[]): string[] {
  return validateQuestionTree(tree).map((issue) => issue.message);
}

export function isLeafNode(node: { children?: unknown[] }): boolean {
  return !Array.isArray(node.children) || node.children.length === 0;
}

export function collectMarkableLeafNodes<T extends { node_type?: string; response_mode?: string; marks?: number | null; children?: T[] }>(node: T): T[] {
  const children = node.children ?? [];
  if (!children.length && node.node_type !== "section" && (node.response_mode !== "none" || typeof node.marks === "number")) return [node];
  return children.flatMap(collectMarkableLeafNodes);
}

export function collectComputedParentNodes<T extends { mark_mode?: string | null; children?: T[] }>(node: T): T[] {
  const children = node.children ?? [];
  const descendants = children.flatMap(collectComputedParentNodes);
  return children.length || node.mark_mode === "computed" ? [node, ...descendants] : descendants;
}

export function calculateNodeMarks<T extends { marks?: number | null; children?: T[] }>(
  node: T,
  awardedByNodeKey: Map<T, number> | ((node: T) => number | null | undefined) = () => null,
): { awarded: number; max: number } {
  const children = node.children ?? [];
  if (!children.length) {
    const awarded = typeof awardedByNodeKey === "function" ? awardedByNodeKey(node) : awardedByNodeKey.get(node);
    return { awarded: Number(awarded ?? 0), max: Number(node.marks ?? 0) };
  }
  return children.map((child) => calculateNodeMarks(child, awardedByNodeKey)).reduce(
    (total, childTotal) => ({ awarded: total.awarded + childTotal.awarded, max: total.max + childTotal.max }),
    { awarded: 0, max: 0 },
  );
}

export function calculateRootQuestionTotal<T extends { marks?: number | null; children?: T[] }>(
  rootNode: T,
  awardedByNodeKey: Map<T, number> | ((node: T) => number | null | undefined) = () => null,
) {
  return calculateNodeMarks(rootNode, awardedByNodeKey);
}

export function calculateAttemptTotal<T extends { marks?: number | null; children?: T[] }>(
  rootNodes: T[],
  awardedByNodeKey: Map<T, number> | ((node: T) => number | null | undefined) = () => null,
) {
  return rootNodes.map((node) => calculateRootQuestionTotal(node, awardedByNodeKey)).reduce(
    (total, rootTotal) => ({ awarded: total.awarded + rootTotal.awarded, max: total.max + rootTotal.max }),
    { awarded: 0, max: 0 },
  );
}

export function matchMarkschemeNodesToQuestions<
  Q extends { node_key: string; ordinal_path?: number[] | null },
  M extends { node_key: string; ordinal_path?: number[] | null },
>(questionNodes: Q[], markschemeNodes: M[]) {
  const questionByKey = new Map(questionNodes.map((node) => [normalizeNodeKey(node.node_key), node]));
  return markschemeNodes.map((markschemeNode) => {
    const key = normalizeNodeKey(markschemeNode.node_key);
    const ordinalPath = Array.isArray(markschemeNode.ordinal_path) ? markschemeNode.ordinal_path : parseNodeKey(markschemeNode.node_key)?.ordinal_path;
    const match = questionByKey.get(key) ?? questionNodes.find((question) => {
      const questionPath = Array.isArray(question.ordinal_path) ? question.ordinal_path : parseNodeKey(question.node_key)?.ordinal_path;
      return Boolean(questionPath && ordinalPath && compareOrdinalPaths(questionPath, ordinalPath) === 0);
    }) ?? null;
    return { markschemeNode, questionNode: match };
  });
}

function hasActualQuestionMarker(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.some((line) => {
    if (/^(question|problem|q)\s*\d{1,2}\b/i.test(line)) return true;
    if (/^\d{1,2}[\).]\s+(?!marks?\b|points?\b|minutes?\b)[A-Za-z0-9$\\(]/.test(line)) return true;
    if (/^\d{1,2}\s+\([a-z]\)\s+/i.test(line)) return true;
    return false;
  });
}

function sectionClassificationReason(type: DocumentSectionType): string {
  switch (type) {
    case "cover":
      return "Front-matter signals were detected without actual question content.";
    case "instructions":
      return "Instruction wording was detected and excluded from question extraction.";
    case "formula_sheet":
      return "Formula-sheet wording was detected.";
    case "contents":
      return "Contents/table-of-contents wording was detected.";
    case "question_page":
      return "Question numbering and question-like content were detected.";
    case "markscheme_cover":
      return "Markscheme cover wording was detected and should not map to Q1.";
    case "markscheme_instructions":
      return "General marking instructions were detected and should not map to a question.";
    case "markscheme_question_page":
      return "Question-specific markscheme content was detected.";
    default:
      return "The section could not be classified reliably.";
  }
}

function questionPartTokenToOrdinal(rawToken: string, depth: number): number {
  const token = rawToken.trim().toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);
  if (/^[ivxlcdm]+$/.test(token) && depth >= 2) return romanToNumber(token);
  if (/^[a-z]+$/.test(token)) return letterToNumber(token);
  if (/^[ivxlcdm]+$/.test(token)) return romanToNumber(token);
  return 9999;
}

function formatPartOrdinal(value: number, depth: number): string {
  if (depth === 1) return numberToLetters(value).toLowerCase();
  if (depth === 2) return numberToRoman(value).toLowerCase();
  if (depth === 3) return numberToLetters(value).toUpperCase();
  return String(value);
}

function numberToLetters(value: number): string {
  let n = Math.max(1, Math.trunc(value));
  let label = "";
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(97 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

export function romanToNumber(raw: string): number {
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

export function letterToNumber(raw: string): number {
  const token = raw.trim().toLowerCase();
  if (!/^[a-z]+$/.test(token)) return 0;
  return token.split("").reduce((total, char) => total * 26 + (char.charCodeAt(0) - 96), 0);
}

function numberToRoman(value: number): string {
  const pairs: Array<[number, string]> = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let remaining = Math.max(1, Math.trunc(value));
  let out = "";
  for (const [amount, symbol] of pairs) {
    while (remaining >= amount) {
      out += symbol;
      remaining -= amount;
    }
  }
  return out;
}

function flattenRawHierarchyNodes(rawNodes: RawQuestionHierarchyNode[]) {
  const flattened: Array<{ node: RawQuestionHierarchyNode; index: number }> = [];
  let index = 0;

  function visit(node: RawQuestionHierarchyNode) {
    flattened.push({ node, index });
    index += 1;
    for (const child of node.children ?? []) visit(child);
  }

  for (const node of rawNodes) visit(node);
  return flattened;
}

function rawNodeToNormalized(
  raw: RawQuestionHierarchyNode,
  parsed: ParsedQuestionNodeKey,
  index: number,
): NormalizedQuestionHierarchyNode {
  const promptHtml = textOrNull(raw.prompt_html ?? raw.prompt?.html);
  const promptLatex = textOrNull(raw.prompt_latex ?? raw.prompt?.latex);
  const assets = Array.isArray(raw.assets) ? raw.assets.filter((asset): asset is string => typeof asset === "string" && asset.length > 0) : [];
  const visualAssetRefs = Array.isArray(raw.visual_asset_refs)
    ? raw.visual_asset_refs.filter((asset): asset is object | string => typeof asset === "string" || isPlainObject(asset))
    : null;
  const hasVisualAssets = Boolean(
    raw.has_visual_assets ||
      assets.length ||
      (visualAssetRefs?.length ?? 0) > 0,
  );

  return {
    node_id: textOrNull(raw.node_id) ?? parsed.normalized_key,
    node_key: parsed.normalized_key,
    normalized_key: parsed.normalized_key,
    display_label: parsed.display_label,
    parent_node_key: parsed.parent_node_key,
    root_question_key: parsed.root_question_key,
    depth: parsed.depth,
    ordinal_path: parsed.ordinal_path,
    ordinal: parsed.ordinal_path[parsed.ordinal_path.length - 1] ?? index + 1,
    node_type: normalizeHierarchyNodeType(raw.node_type, parsed.depth),
    title: textOrNull(raw.title),
    prompt_html: promptHtml,
    prompt_latex: promptLatex,
    marks: numberOrNull(raw.marks ?? raw.marks_available),
    marks_available: numberOrNull(raw.marks_available ?? raw.marks),
    mark_mode: raw.mark_mode === "computed" ? "computed" : "manual",
    response_mode: normalizeHierarchyResponseMode(raw.response_mode),
    interaction_json: isPlainObject(raw.interaction_json) ? raw.interaction_json : isPlainObject(raw.interaction) ? raw.interaction : null,
    markscheme_html: textOrNull(raw.markscheme_html),
    assets,
    source_page_start: positiveIntegerOrNull(raw.source_page_start),
    source_page_end: positiveIntegerOrNull(raw.source_page_end),
    source_region_json: isPlainObject(raw.source_region_json) ? raw.source_region_json : null,
    has_visual_assets: hasVisualAssets,
    visual_asset_refs: visualAssetRefs,
    children: [],
  };
}

function createSyntheticHierarchyNode(path: number[], descendantId: string): NormalizedQuestionHierarchyNode {
  const parsed = parseNodeKey(formatQuestionDisplayLabel(path))!;
  return {
    node_id: `synthetic:${descendantId}:${path.join(".")}`,
    node_key: parsed.normalized_key,
    normalized_key: parsed.normalized_key,
    display_label: parsed.display_label,
    parent_node_key: parsed.parent_node_key,
    root_question_key: parsed.root_question_key,
    depth: parsed.depth,
    ordinal_path: parsed.ordinal_path,
    ordinal: parsed.ordinal_path[parsed.ordinal_path.length - 1] ?? 0,
    node_type: parsed.node_type,
    title: parsed.depth === 0 ? `Question ${parsed.ordinal_path[0]}` : null,
    prompt_html: null,
    prompt_latex: null,
    marks: null,
    marks_available: null,
    mark_mode: "computed",
    response_mode: "none",
    interaction_json: null,
    markscheme_html: null,
    assets: [],
    source_page_start: null,
    source_page_end: null,
    source_region_json: null,
    has_visual_assets: false,
    visual_asset_refs: null,
    synthetic: true,
    children: [],
  };
}

function mergeHierarchyNodes(
  existing: NormalizedQuestionHierarchyNode,
  incoming: NormalizedQuestionHierarchyNode,
): NormalizedQuestionHierarchyNode {
  const preferIncoming = Boolean(existing.synthetic && !incoming.synthetic);
  const base = preferIncoming ? incoming : existing;
  const other = preferIncoming ? existing : incoming;
  const richerPrompt = richnessScore(incoming) > richnessScore(existing) ? incoming : existing;
  const sourcePageStart = existing.source_page_start ?? incoming.source_page_start;
  const sourcePageEnd = existing.source_page_end ?? incoming.source_page_end;
  const assets = dedupeStrings([...existing.assets, ...incoming.assets]);

  return {
    ...base,
    title: base.title ?? other.title,
    prompt_html: richerPrompt.prompt_html ?? base.prompt_html ?? other.prompt_html,
    prompt_latex: richerPrompt.prompt_latex ?? base.prompt_latex ?? other.prompt_latex,
    marks: base.marks ?? other.marks,
    marks_available: base.marks_available ?? other.marks_available ?? base.marks ?? other.marks,
    mark_mode: base.mark_mode === "computed" || other.mark_mode === "computed" ? "computed" : "manual",
    response_mode: base.response_mode !== "none" ? base.response_mode : other.response_mode,
    interaction_json: base.interaction_json ?? other.interaction_json,
    markscheme_html: base.markscheme_html ?? other.markscheme_html,
    assets,
    source_page_start: sourcePageStart,
    source_page_end: sourcePageEnd,
    source_region_json: base.source_region_json ?? other.source_region_json,
    has_visual_assets: base.has_visual_assets || other.has_visual_assets || assets.length > 0,
    visual_asset_refs: base.visual_asset_refs ?? other.visual_asset_refs,
    synthetic: existing.synthetic && incoming.synthetic ? true : undefined,
    children: [],
  };
}

function finalizeHierarchyNode(node: NormalizedQuestionHierarchyNode): void {
  sortNormalizedTree(node.children);
  for (const child of node.children) finalizeHierarchyNode(child);

  if (node.children.length) {
    node.mark_mode = "computed";
    node.response_mode = node.depth === 0 ? "upload_pdf" : "none";
    if (node.marks_available === null) {
      const childTotal = node.children.reduce((sum, child) => sum + Number(child.marks_available ?? child.marks ?? 0), 0);
      node.marks_available = childTotal > 0 ? childTotal : null;
    }
    if (node.marks === null && node.marks_available !== null) node.marks = node.marks_available;
    return;
  }

  node.mark_mode = "manual";
  if (node.depth > 0 && ["upload_pdf", "typed_or_upload", "typed_text"].includes(node.response_mode)) {
    node.response_mode = "none";
  }
  node.marks_available = node.marks_available ?? node.marks;
}

function sortNormalizedTree(nodes: NormalizedQuestionHierarchyNode[]) {
  nodes.sort((a, b) => compareOrdinalPaths(a.ordinal_path, b.ordinal_path));
}

function flattenNormalizedTree(node: NormalizedQuestionHierarchyNode): NormalizedQuestionHierarchyNode[] {
  return [node, ...node.children.flatMap(flattenNormalizedTree)];
}

function normalizeHierarchyNodeType(rawType: RawQuestionHierarchyNode["node_type"], depth: number) {
  if (rawType === "section") return "section";
  if (depth === 0) return "question";
  if (depth === 1) return "subquestion";
  return "part";
}

function normalizeHierarchyResponseMode(rawMode: RawQuestionHierarchyNode["response_mode"]): NormalizedQuestionHierarchyNode["response_mode"] {
  const normalized = String(rawMode ?? "none").toLowerCase().replaceAll("-", "_");
  if (
    normalized === "none" ||
    normalized === "upload_pdf" ||
    normalized === "typed_text" ||
    normalized === "typed_or_upload" ||
    normalized === "multiple_choice" ||
    normalized === "numerical"
  ) {
    return normalized;
  }
  if (normalized === "pdf" || normalized === "upload") return "upload_pdf";
  if (normalized === "typed" || normalized === "text") return "typed_text";
  return "none";
}

function richnessScore(node: NormalizedQuestionHierarchyNode) {
  return [node.prompt_html, node.prompt_latex, node.markscheme_html, node.title]
    .map((value) => value?.length ?? 0)
    .reduce((sum, length) => sum + length, 0) + node.assets.length * 50;
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function isPlainObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
