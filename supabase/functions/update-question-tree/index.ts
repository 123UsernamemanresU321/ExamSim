import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireOwner } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

type FlatNode = {
  node_key: string;
  parent_node_key: string | null;
  ordinal: number;
  node_type: "section" | "question" | "subquestion" | "part";
  title: string | null;
  prompt_html: string | null;
  prompt_latex: string | null;
  marks: number | null;
  response_mode: "none" | "typed_text" | "upload_pdf" | "typed_or_upload" | "multiple_choice";
  interaction_json: unknown;
  markscheme_html: string | null;
  source_page_start: number | null;
  source_page_end: number | null;
};

const NODE_TYPES = new Set(["section", "question", "subquestion", "part"]);
const RESPONSE_MODES = new Set(["none", "typed_text", "upload_pdf", "typed_or_upload", "multiple_choice"]);

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { admin } = await requireOwner(request);
    const body = await readJson<Record<string, unknown>>(request);
    const versionId = stringValue(body.version_id) ?? stringValue(body.assessment_version_id);
    if (!versionId) return json({ error: "version_id is required" }, 400);
    const normalizedPackage = extractNormalizedPackage(body);
    if (normalizedPackage) {
      const parsed = normalizedPackageSchema.safeParse(normalizedPackage);
      if (!parsed.success) {
        console.error("Package validation failed:", parsed.error.format());
        throw new Error(`Package failed schema validation: ${parsed.error.errors[0]?.path.join(".") || "unknown field"} is ${parsed.error.errors[0]?.message || "invalid"}`);
      }
    }
    const nodes = extractNodes(body, normalizedPackage);
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
    return json({ ok: true, node_count: Number(nodeCount ?? rows.length) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "update-question-tree failed" }, 401);
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
    const normalized = {
      node_id: node.node_key,
      node_key: node.node_key,
      ordinal: Math.max(0, node.ordinal),
      node_type: node.node_type,
      title: node.title ?? undefined,
      marks: node.marks !== null ? Math.max(0, node.marks) : undefined,
      response_mode: node.response_mode,
      prompt: (html || latex) ? { html, latex } : undefined,
      interaction: normalizeInteraction(node.interaction_json),
      markscheme_html: node.markscheme_html ?? undefined,
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
  let kind: "choice" | "short_text" | "extended_text" = "extended_text";
  if (kindStr.includes("choice")) kind = "choice";
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
  if (["choice", "mcq", "multiple_choice_question"].includes(normalized)) return "multiple_choice";
  return "typed_or_upload";
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
