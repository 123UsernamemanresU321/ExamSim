import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireOwner } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type FlatNode = {
  node_key: string;
  parent_node_key: string | null;
  ordinal: number;
  node_type: "section" | "question" | "subquestion" | "part";
  title: string | null;
  prompt_html: string | null;
  prompt_latex: string | null;
  marks: number | null;
  response_mode: "none" | "typed_text" | "upload_pdf" | "typed_or_upload" | "multiple_choice" | "numerical";
  interaction_json: unknown;
  markscheme_html: string | null;
  assets: string[];
  source_page_start: number | null;
  source_page_end: number | null;
};

const NODE_TYPES = new Set(["section", "question", "subquestion", "part"]);
const RESPONSE_MODES = new Set(["none", "typed_text", "upload_pdf", "typed_or_upload", "multiple_choice", "numerical"]);

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { admin } = await requireOwner(request);
    const body = await readJson<Record<string, unknown>>(request);
    const versionId = stringValue(body.version_id) ?? stringValue(body.assessment_version_id);
    if (!versionId) return json({ error: "version_id is required" }, 400);
    const normalizedPackage = extractNormalizedPackage(body);
    const nodes = repairFlatNodeHierarchy(extractNodes(body, normalizedPackage));
    if (!nodes.length) {
      return json({ error: "nodes are required. Paste a node array, a normalized package with questions, or an object with nodes/questions." }, 400);
    }

    const { data: version, error: versionLookupError } = await admin
      .from("assessment_versions")
      .select("status, normalized_package_json, assessments(id,title,paper_code,assessment_kind)")
      .eq("id", versionId)
      .single();
    if (versionLookupError) throw versionLookupError;
    if (version.status === "published") return json({ error: "Published assessment versions are immutable. Create a new draft version before editing the tree." }, 409);

    const validationError = validateNodeTree(nodes);
    if (validationError) return json({ error: validationError }, 400);

    const rows = nodes.map((node) => ({
      assessment_version_id: versionId,
      node_key: node.node_key,
      ordinal: node.ordinal,
      node_type: node.node_type,
      title: node.title,
      prompt_html: node.prompt_html,
      prompt_latex: node.prompt_latex,
      marks: node.marks,
      response_mode: node.response_mode,
      interaction_json: node.interaction_json,
      markscheme_html: node.markscheme_html,
      assets: node.assets || [],
      source_page_start: node.source_page_start,
      source_page_end: node.source_page_end,
    }));
    const packageJson = normalizedPackage ?? normalizePackageWithQuestions(version.normalized_package_json as Record<string, unknown>, nestFlatNodes(nodes));
    const { data: nodeCount, error: replaceError } = await admin.rpc("replace_question_tree_for_version", {
      p_version_id: versionId,
      p_nodes: rows,
      p_package_json: packageJson,
    });
    if (replaceError) throw replaceError;

    const { data: savedNodes, error: savedNodeError } = await admin
      .from("question_nodes")
      .select("id,node_key")
      .eq("assessment_version_id", versionId);
    if (savedNodeError) throw savedNodeError;
    const idByKey = new Map((savedNodes ?? []).map((savedNode: { id: string; node_key: string }) => [canonicalQuestionKey(savedNode.node_key), savedNode.id]));
    const nodesWithChildren = new Set(nodes.filter((node) => nodes.some((child) => child.parent_node_key === node.node_key)).map((node) => node.node_key));
    for (const node of nodes) {
      const path = ordinalPathForQuestionKey(node.node_key, node.ordinal);
      const rootKey = path.length ? `Q${path[0]}` : node.node_key;
      const rootId = idByKey.get(canonicalQuestionKey(rootKey)) ?? idByKey.get(canonicalQuestionKey(node.node_key)) ?? null;
      const { error: metadataError } = await admin
        .from("question_nodes")
        .update({
          markscheme_html: node.markscheme_html,
          assets: node.assets || [],
          source_page_start: node.source_page_start,
          source_page_end: node.source_page_end,
          root_question_id: rootId,
          display_label: path.length === 1 ? `Q${path[0]}` : node.node_key,
          depth: Math.max(0, path.length - 1),
          ordinal_path: path,
          sort_key: path.join("."),
          mark_mode: nodesWithChildren.has(node.node_key) ? "computed" : "manual",
          has_visual_assets: Boolean(node.assets?.length),
          visual_asset_refs: node.assets || [],
        })
        .eq("assessment_version_id", versionId)
        .eq("node_key", node.node_key);
      if (metadataError) throw metadataError;
    }

    const assessmentMarkschemeHtml = normalizedPackage && isRecord(normalizedPackage.assessment)
      ? stringValue(normalizedPackage.assessment.markscheme_html)
      : null;
    if (assessmentMarkschemeHtml) {
      const { error: markschemeUpdateError } = await admin
        .from("assessment_versions")
        .update({ markscheme_html: assessmentMarkschemeHtml })
        .eq("id", versionId);
      if (markschemeUpdateError) throw markschemeUpdateError;
    }
    return json({ ok: true, node_count: Number(nodeCount ?? rows.length) });
  } catch (error) {
    console.error("Update question tree error:", error);
    return errorResponse(error, "update-question-tree failed");
  }
});

function extractNodes(body: Record<string, unknown>, normalizedPackage: Record<string, unknown> | null) {
  if (Array.isArray(body.nodes)) return normalizeFlatNodes(body.nodes);
  if (isRecord(body.nodes)) {
    const nestedPackage = extractNormalizedPackage(body.nodes);
    if (nestedPackage) return normalizePackageQuestions(nestedPackage.questions as unknown[]);
  }
  if (normalizedPackage) return normalizePackageQuestions(normalizedPackage.questions as unknown[]);
  if (Array.isArray(body.questions)) return normalizePackageQuestions(body.questions);
  return [];
}

function extractNormalizedPackage(value: Record<string, unknown>) {
  if (Array.isArray(value.questions)) return value;
  const normalized = value.normalized_package ?? value.normalized_package_json;
  if (isRecord(normalized) && Array.isArray(normalized.questions)) return normalized;
  const suggestion = value.suggestion;
  if (isRecord(suggestion)) {
    const suggestionPackage = suggestion.normalized_package ?? suggestion.normalized_package_json;
    if (isRecord(suggestionPackage) && Array.isArray(suggestionPackage.questions)) return suggestionPackage;
  }
  return null;
}

function normalizePackageQuestions(questions: unknown[]) {
  const nodes: FlatNode[] = [];
  function visit(rawNode: unknown, index: number, parentNodeKey: string | null) {
    if (!isRecord(rawNode)) return;
    const nodeKey = stringValue(rawNode.node_key) ?? stringValue(rawNode.node_id) ?? `${parentNodeKey ? `${parentNodeKey}.` : ""}${index + 1}`;
    const prompt = isRecord(rawNode.prompt) ? rawNode.prompt : {};
    nodes.push({
      node_key: nodeKey,
      parent_node_key: parentNodeKey,
      ordinal: numberValue(rawNode.ordinal) ?? index + 1,
      node_type: normalizeNodeType(rawNode.node_type),
      title: stringValue(rawNode.title),
      prompt_html: stringValue(rawNode.prompt_html) ?? stringValue(prompt.html),
      prompt_latex: stringValue(rawNode.prompt_latex) ?? stringValue(prompt.latex),
      marks: numberValue(rawNode.marks),
      response_mode: normalizeResponseMode(rawNode.response_mode),
      interaction_json: isRecord(rawNode.interaction_json) ? rawNode.interaction_json : isRecord(rawNode.interaction) ? rawNode.interaction : null,
      markscheme_html: stringValue(rawNode.markscheme_html),
      assets: Array.isArray(rawNode.assets) ? rawNode.assets.filter(a => typeof a === "string") : [],
      source_page_start: numberValue(rawNode.source_page_start),
      source_page_end: numberValue(rawNode.source_page_end),
    });
    if (Array.isArray(rawNode.children)) {
      rawNode.children.forEach((child, childIndex) => visit(child, childIndex, nodeKey));
    }
  }
  questions.forEach((question, index) => visit(question, index, null));
  return nodes;
}

function repairFlatNodeHierarchy(inputNodes: FlatNode[]): FlatNode[] {
  const mergedByKey = new Map<string, FlatNode>();
  for (const inputNode of inputNodes) {
    const path = ordinalPathForQuestionKey(inputNode.node_key, inputNode.ordinal);
    const nodeKey = path.length === 1 ? `Q${path[0]}` : path.length > 1 ? formatQuestionKeyFromOrdinalPath(path) : inputNode.node_key;
    const node = {
      ...inputNode,
      node_key: nodeKey,
      ordinal: path[path.length - 1] ?? inputNode.ordinal,
      node_type: path.length === 1 ? "question" : path.length === 2 ? "subquestion" : path.length > 2 ? "part" : inputNode.node_type,
    };
    const canonical = canonicalQuestionKey(nodeKey);
    const existing = mergedByKey.get(canonical);
    mergedByKey.set(canonical, existing ? mergeFlatNodes(existing, node) : node);
  }
  const nodes = [...mergedByKey.values()];
  for (const node of nodes) {
    const path = ordinalPathForQuestionKey(node.node_key, node.ordinal);
    node.parent_node_key = path.length > 1
      ? path.length === 2
        ? `Q${path[0]}`
        : formatQuestionKeyFromOrdinalPath(path.slice(0, -1))
      : null;
  }
  const byCanonicalKey = new Map<string, FlatNode>();
  for (const node of nodes) {
    const canonical = canonicalQuestionKey(node.node_key);
    if (canonical && !byCanonicalKey.has(canonical)) byCanonicalKey.set(canonical, node);
  }

  for (const node of [...nodes]) {
    const path = ordinalPathForQuestionKey(node.node_key, node.ordinal);
    if (path.length <= 1) continue;

    for (let depth = 1; depth < path.length; depth += 1) {
      const ancestorPath = path.slice(0, depth);
      const ancestorKey = depth === 1 ? `Q${ancestorPath[0]}` : formatQuestionKeyFromOrdinalPath(ancestorPath);
      const canonical = canonicalQuestionKey(ancestorKey);
      if (canonical && !byCanonicalKey.has(canonical)) {
        const parentPath = ancestorPath.slice(0, -1);
        const parentKey = parentPath.length
          ? parentPath.length === 1
            ? `Q${parentPath[0]}`
            : formatQuestionKeyFromOrdinalPath(parentPath)
          : null;
        const synthetic: FlatNode = {
          node_key: ancestorKey,
          parent_node_key: parentKey,
          ordinal: ancestorPath[ancestorPath.length - 1] ?? 1,
          node_type: ancestorPath.length === 1 ? "question" : ancestorPath.length === 2 ? "subquestion" : "part",
          title: ancestorPath.length === 1 ? `Question ${ancestorPath[0]}` : null,
          prompt_html: null,
          prompt_latex: null,
          marks: null,
          response_mode: "none",
          interaction_json: null,
          markscheme_html: null,
          assets: [],
          source_page_start: null,
          source_page_end: null,
        };
        nodes.push(synthetic);
        byCanonicalKey.set(canonical, synthetic);
      }
    }

    if (!node.parent_node_key) {
      const parentPath = path.slice(0, -1);
      const parentKey = parentPath.length === 1 ? `Q${parentPath[0]}` : formatQuestionKeyFromOrdinalPath(parentPath);
      const parent = byCanonicalKey.get(canonicalQuestionKey(parentKey));
      if (parent && canonicalQuestionKey(parent.node_key) !== canonicalQuestionKey(node.node_key)) {
        node.parent_node_key = parent.node_key;
      }
    }
  }

  const childrenByParent = new Map<string, FlatNode[]>();
  for (const node of nodes) {
    if (!node.parent_node_key) continue;
    const parentCanonical = canonicalQuestionKey(node.parent_node_key);
    const children = childrenByParent.get(parentCanonical) ?? [];
    children.push(node);
    childrenByParent.set(parentCanonical, children);
  }

  for (const [parentKey, children] of childrenByParent) {
    const parent = byCanonicalKey.get(parentKey);
    if (parent) parent.response_mode = "none";
    children.sort(compareFlatNodesByOrdinalPath);
    children.forEach((child, index) => {
      child.ordinal = index + 1;
    });
  }

  for (const node of nodes) {
    const hasChildren = childrenByParent.has(canonicalQuestionKey(node.node_key));
    if (hasChildren) {
      node.response_mode = ordinalPathForQuestionKey(node.node_key, node.ordinal).length === 1 ? "upload_pdf" : "none";
      continue;
    }
    if (
      node.node_type !== "question" &&
      node.response_mode !== "none"
    ) {
      node.response_mode = "none";
    }
  }

  return nodes.sort(compareFlatNodesByOrdinalPath);
}

function mergeFlatNodes(existing: FlatNode, incoming: FlatNode): FlatNode {
  const existingScore = richnessScore(existing);
  const incomingScore = richnessScore(incoming);
  const promptSource = incomingScore > existingScore ? incoming : existing;
  return {
    ...existing,
    title: existing.title ?? incoming.title,
    prompt_html: promptSource.prompt_html ?? existing.prompt_html ?? incoming.prompt_html,
    prompt_latex: promptSource.prompt_latex ?? existing.prompt_latex ?? incoming.prompt_latex,
    marks: existing.marks ?? incoming.marks,
    response_mode: existing.response_mode !== "none" ? existing.response_mode : incoming.response_mode,
    interaction_json: existing.interaction_json ?? incoming.interaction_json,
    markscheme_html: existing.markscheme_html ?? incoming.markscheme_html,
    assets: [...new Set([...(existing.assets ?? []), ...(incoming.assets ?? [])])],
    source_page_start: existing.source_page_start ?? incoming.source_page_start,
    source_page_end: existing.source_page_end ?? incoming.source_page_end,
  };
}

function richnessScore(node: FlatNode) {
  return (node.prompt_html?.length ?? 0) + (node.prompt_latex?.length ?? 0) + (node.markscheme_html?.length ?? 0) + (node.assets?.length ?? 0) * 50;
}

function normalizeFlatNodes(rawNodes: unknown[]) {
  return rawNodes.map((rawNode, index) => {
    if (!isRecord(rawNode)) throw new Error(`Node ${index + 1} must be an object`);
    return {
      node_key: stringValue(rawNode.node_key) ?? stringValue(rawNode.node_id) ?? String(index + 1),
      parent_node_key: stringValue(rawNode.parent_node_key),
      ordinal: numberValue(rawNode.ordinal) ?? index + 1,
      node_type: normalizeNodeType(rawNode.node_type),
      title: stringValue(rawNode.title),
      prompt_html: stringValue(rawNode.prompt_html) ?? (isRecord(rawNode.prompt) ? stringValue(rawNode.prompt.html) : null),
      prompt_latex: stringValue(rawNode.prompt_latex) ?? (isRecord(rawNode.prompt) ? stringValue(rawNode.prompt.latex) : null),
      marks: numberValue(rawNode.marks),
      response_mode: normalizeResponseMode(rawNode.response_mode),
      interaction_json: isRecord(rawNode.interaction_json) ? rawNode.interaction_json : isRecord(rawNode.interaction) ? rawNode.interaction : null,
      markscheme_html: stringValue(rawNode.markscheme_html),
      assets: Array.isArray(rawNode.assets) ? rawNode.assets.filter(a => typeof a === "string") : [],
      source_page_start: numberValue(rawNode.source_page_start),
      source_page_end: numberValue(rawNode.source_page_end),
    };
  });
}

function validateNodeTree(nodes: FlatNode[]) {
  const seen = new Set<string>();
  const parentByKey = new Map<string, string | null>();
  for (const node of nodes) {
    if (seen.has(node.node_key)) return `Duplicate node_key "${node.node_key}". Every question and subquestion needs a unique key.`;
    seen.add(node.node_key);
    parentByKey.set(node.node_key, node.parent_node_key);
  }

  for (const node of nodes) {
    if (!node.parent_node_key) continue;
    if (node.parent_node_key === node.node_key) return `Node "${node.node_key}" cannot be its own parent.`;
    if (!parentByKey.has(node.parent_node_key)) return `Node "${node.node_key}" references missing parent_node_key "${node.parent_node_key}".`;
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function hasCycle(nodeKey: string): boolean {
    if (visited.has(nodeKey)) return false;
    if (visiting.has(nodeKey)) return true;
    visiting.add(nodeKey);
    const parentKey = parentByKey.get(nodeKey);
    const cycle = Boolean(parentKey && hasCycle(parentKey));
    visiting.delete(nodeKey);
    visited.add(nodeKey);
    return cycle;
  }

  for (const node of nodes) {
    if (hasCycle(node.node_key)) return `Question tree contains a parent cycle involving "${node.node_key}".`;
  }
  return null;
}

function buildPackageFromNodes(version: Record<string, unknown>, nodes: FlatNode[]) {
  const assessment = isRecord(version.assessments) ? version.assessments : {};
  return {
    schema_version: "2026-05-07",
    assessment: {
      id: stringValue(assessment.id) ?? "reviewed-assessment",
      title: stringValue(assessment.title) ?? "Reviewed assessment",
      paper_code: stringValue(assessment.paper_code) ?? undefined,
      assessment_kind: stringValue(assessment.assessment_kind) ?? "test",
      source_kind: "json",
      authoring_origin: "owner_pasted",
      display_timezone: "Africa/Johannesburg",
    },
    delivery: {
      delivery_mode: "browser",
      solutions_requested: true,
      response_policy: {
        typed_allowed: true,
        mixed_mode_allowed: true,
        per_question_pdf_upload: true,
        blank_submission_required_for_unattempted: false,
      },
    },
    source: {
      normalized_by: "owner_review",
      parse_confidence: 1,
      requires_owner_review: false,
    },
    questions: nestFlatNodes(nodes),
  };
}

function normalizePackageWithQuestions(existing: Record<string, unknown>, questions: Record<string, unknown>[]) {
  const base = isRecord(existing) && Object.keys(existing).length > 2 ? existing : buildPackageFromNodes({}, []);
  return {
    ...base,
    questions,
  };
}

function nestFlatNodes(nodes: FlatNode[]) {
  const byKey = new Map<string, Record<string, unknown>>();
  const roots: Record<string, unknown>[] = [];
  for (const node of nodes) {
    const html = node.prompt_html ?? undefined;
    const latex = node.prompt_latex ?? undefined;
    const ordinalPath = ordinalPathForQuestionKey(node.node_key, node.ordinal);
    const normalized = {
      node_id: node.node_key,
      node_key: node.node_key,
      display_label: ordinalPath.length === 1 ? `Q${ordinalPath[0]}` : node.node_key,
      depth: Math.max(0, ordinalPath.length - 1),
      ordinal_path: ordinalPath,
      ordinal: Math.max(0, node.ordinal),
      node_type: node.node_type,
      title: node.title ?? undefined,
      marks: node.marks !== null ? Math.max(0, node.marks) : undefined,
      response_mode: node.response_mode,
      prompt: (html || latex) ? { html, latex } : undefined,
      interaction: normalizeInteraction(node.interaction_json),
      markscheme_html: node.markscheme_html ?? undefined,
      assets: Array.isArray(node.assets) ? node.assets : [],
      source_page_start: node.source_page_start ?? undefined,
      source_page_end: node.source_page_end ?? undefined,
      children: [] as Record<string, unknown>[],
    };
    byKey.set(node.node_key, normalized);
  }
  for (const node of nodes) {
    const normalized = byKey.get(node.node_key);
    if (!normalized) continue;
    if (node.parent_node_key && byKey.has(node.parent_node_key)) {
      const parent = byKey.get(node.parent_node_key);
      const children = parent?.children;
      if (Array.isArray(children)) children.push(normalized);
    } else {
      roots.push(normalized);
    }
  }
  function cleanup(n: Record<string, unknown>) {
    if (Array.isArray(n.children) && n.children.length === 0) delete n.children;
    else if (Array.isArray(n.children)) n.children.forEach((c) => cleanup(c as Record<string, unknown>));
  }
  roots.forEach(cleanup);
  return roots;
}

function normalizeInteraction(raw: unknown) {
  if (!isRecord(raw)) return undefined;
  const kindStr = String(raw.kind ?? raw.type ?? "").toLowerCase().replaceAll("-", "_");
  let kind: "choice" | "short_text" | "extended_text" | "numerical" = "extended_text";
  if (kindStr.includes("choice")) kind = "choice";
  else if (kindStr.includes("numeric") || kindStr.includes("number") || kindStr.includes("decimal")) kind = "numerical";
  else if (kindStr.includes("short")) kind = "short_text";

  const choices = Array.isArray(raw.choices)
    ? raw.choices
        .map((c, i) => {
          const rc = isRecord(c) ? c : {};
          const cid = stringValue(rc.choice_id) ?? stringValue(rc.id) ?? String(i + 1);
          const content = stringValue(rc.content_html) ?? stringValue(rc.text) ?? stringValue(rc.content) ?? `Choice ${i + 1}`;
          return { choice_id: cid, content_html: content };
        })
        .filter((c) => c.choice_id && c.content_html)
    : undefined;

  return {
    kind,
    max_choices: numberValue(raw.max_choices) !== null ? Math.max(1, numberValue(raw.max_choices)!) : undefined,
    shuffle: booleanValue(raw.shuffle) ?? undefined,
    choices: choices?.length ? choices : undefined,
    min_value: numberValue(raw.min_value) ?? undefined,
    max_value: numberValue(raw.max_value) ?? undefined,
    step: numberValue(raw.step) !== null && numberValue(raw.step)! > 0 ? numberValue(raw.step)! : undefined,
    tolerance: numberValue(raw.tolerance) !== null ? Math.max(0, numberValue(raw.tolerance)!) : undefined,
    unit: stringValue(raw.unit) ?? undefined,
  };
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeNodeType(value: unknown): FlatNode["node_type"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return NODE_TYPES.has(normalized) ? normalized as FlatNode["node_type"] : "question";
}

function normalizeResponseMode(value: unknown): FlatNode["response_mode"] {
  if (typeof value !== "string") return "typed_or_upload";
  const normalized = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (RESPONSE_MODES.has(normalized)) return normalized as FlatNode["response_mode"];
  if (["typed", "text", "written", "essay", "short_answer", "long_answer"].includes(normalized)) return "typed_text";
  if (["pdf", "upload", "file_upload", "scan_upload"].includes(normalized)) return "upload_pdf";
  if (["mixed", "typed_upload", "typed_or_pdf"].includes(normalized)) return "typed_or_upload";
  if (["choice", "mcq", "multiple_choice_question", "multi_select", "multiple_response"].includes(normalized)) return "multiple_choice";
  if (["numeric", "number", "numerical", "decimal", "integer", "calculation"].includes(normalized)) return "numerical";
  return "typed_or_upload";
}

function compareFlatNodesByOrdinalPath(a: FlatNode, b: FlatNode) {
  const left = ordinalPathForQuestionKey(a.node_key, a.ordinal);
  const right = ordinalPathForQuestionKey(b.node_key, b.ordinal);
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return a.node_key.localeCompare(b.node_key, "en", { numeric: true, sensitivity: "base" });
}

function canonicalQuestionKey(rawKey: string | null | undefined): string {
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
    .toLowerCase();
}

function ordinalPathForQuestionKey(rawKey: string | null | undefined, fallbackOrdinal?: number | null): number[] {
  const key = canonicalQuestionKey(rawKey);
  const rootMatch = key.match(/^(\d+)/);
  const path: number[] = [];
  if (rootMatch) {
    path.push(Number(rootMatch[1]));
    [...key.matchAll(/\(([^()]+)\)/g)].forEach((match, index) => {
      path.push(partTokenToOrdinal(match[1] ?? "", index + 1));
    });
  }
  if (!path.length && typeof fallbackOrdinal === "number" && Number.isFinite(fallbackOrdinal)) path.push(Math.max(0, fallbackOrdinal));
  return path;
}

function formatQuestionKeyFromOrdinalPath(path: number[]) {
  if (!path.length) return "";
  const [root, ...parts] = path;
  return `${root}${parts.map((part, index) => `(${formatPartOrdinal(part, index + 1)})`).join("")}`;
}

function partTokenToOrdinal(rawToken: string, depth: number): number {
  const token = rawToken.trim().toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);
  if (/^[ivxlcdm]+$/.test(token) && depth >= 2) return romanToNumber(token);
  if (/^[a-z]$/.test(token)) return token.charCodeAt(0) - 96;
  if (/^[ivxlcdm]+$/.test(token)) return romanToNumber(token);
  return 9999;
}

function formatPartOrdinal(value: number, depth: number): string {
  if (depth === 1) return String.fromCharCode(96 + Math.max(1, Math.min(26, value)));
  if (depth === 2) return numberToRoman(value);
  if (depth === 3) return String.fromCharCode(64 + Math.max(1, Math.min(26, value)));
  return String(value);
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

function numberToRoman(value: number) {
  const pairs: Array<[number, string]> = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
