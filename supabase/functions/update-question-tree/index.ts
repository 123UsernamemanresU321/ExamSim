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
    const nodes = extractNodes(body, normalizedPackage);
    if (!nodes.length) {
      return json({ error: "nodes are required. Paste a node array, a normalized package with questions, or an object with nodes/questions." }, 400);
    }

    const { data: version, error: versionLookupError } = await admin
      .from("assessment_versions")
      .select("normalized_package_json, assessments(id,title,paper_code,assessment_kind)")
      .eq("id", versionId)
      .single();
    if (versionLookupError) throw versionLookupError;

    const { error: deleteError } = await admin.from("question_nodes").delete().eq("assessment_version_id", versionId);
    if (deleteError) throw deleteError;
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
    }));
    const { data: insertedNodes, error: insertError } = await admin.from("question_nodes").insert(rows).select("id,node_key");
    if (insertError) throw insertError;
    const idByKey = new Map((insertedNodes ?? []).map((node) => [node.node_key, node.id]));
    for (const node of nodes) {
      if (!node.parent_node_key) continue;
      const parentId = idByKey.get(node.parent_node_key);
      const nodeId = idByKey.get(node.node_key);
      if (parentId && nodeId) {
        await admin.from("question_nodes").update({ parent_node_id: parentId }).eq("id", nodeId);
      }
    }

    const packageJson = normalizedPackage ?? buildPackageFromNodes(version, nodes);
    const { error: versionError } = await admin
      .from("assessment_versions")
      .update({ requires_owner_review: false, status: "draft", normalized_package_json: packageJson })
      .eq("id", versionId);
    if (versionError) throw versionError;
    return json({ ok: true, node_count: rows.length });
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
      prompt_html: stringValue(rawNode.prompt_html),
      prompt_latex: stringValue(rawNode.prompt_latex),
      marks: numberValue(rawNode.marks),
      response_mode: normalizeResponseMode(rawNode.response_mode),
      interaction_json: isRecord(rawNode.interaction_json) ? rawNode.interaction_json : null,
    };
  });
}

function buildPackageFromNodes(version: Record<string, unknown>, nodes: FlatNode[]) {
  if (isRecord(version.normalized_package_json)) {
    return { ...version.normalized_package_json, questions: nestFlatNodes(nodes) };
  }
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

function nestFlatNodes(nodes: FlatNode[]) {
  const byKey = new Map<string, Record<string, unknown>>();
  const roots: Record<string, unknown>[] = [];
  for (const node of nodes) {
    const normalized = {
      node_id: node.node_key,
      node_key: node.node_key,
      ordinal: node.ordinal,
      node_type: node.node_type,
      title: node.title ?? undefined,
      marks: node.marks ?? undefined,
      response_mode: node.response_mode,
      prompt: { html: node.prompt_html ?? undefined, latex: node.prompt_latex ?? undefined },
      interaction: isRecord(node.interaction_json) ? node.interaction_json : undefined,
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
  return roots;
}

function normalizeNodeType(value: unknown): FlatNode["node_type"] {
  return typeof value === "string" && NODE_TYPES.has(value) ? value as FlatNode["node_type"] : "question";
}

function normalizeResponseMode(value: unknown): FlatNode["response_mode"] {
  return typeof value === "string" && RESPONSE_MODES.has(value) ? value as FlatNode["response_mode"] : "typed_or_upload";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
