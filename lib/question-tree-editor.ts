import type { Json, QuestionNodeRow } from "@/types/database";

export type EditableQuestionNode = {
  node_key: string;
  parent_node_key?: string | null;
  ordinal: number;
  node_type: QuestionNodeRow["node_type"];
  title: string | null;
  prompt_html: string | null;
  prompt_latex: string | null;
  marks: number | null;
  response_mode: QuestionNodeRow["response_mode"];
  interaction_json: Json | null;
};

export type ParsedQuestionTreeInput = {
  nodes: EditableQuestionNode[];
  normalizedPackage: Record<string, unknown> | null;
};

type NormalizedPackageLike = Record<string, unknown> & {
  questions: unknown[];
};

const NODE_TYPES = new Set(["section", "question", "subquestion", "part"]);
const RESPONSE_MODES = new Set(["none", "typed_text", "upload_pdf", "typed_or_upload", "multiple_choice"]);

export function serializeEditableQuestionNodes(nodes: QuestionNodeRow[]) {
  const editable = nodes.map((node) => ({
    node_key: node.node_key,
    parent_node_key: null,
    ordinal: node.ordinal,
    node_type: node.node_type,
    title: node.title,
    prompt_html: node.prompt_html,
    prompt_latex: node.prompt_latex,
    marks: node.marks,
    response_mode: node.response_mode,
    interaction_json: node.interaction_json,
  }));
  return JSON.stringify(editable, null, 2);
}

export function parseQuestionTreeInput(value: string): ParsedQuestionTreeInput {
  const parsed = JSON.parse(value) as unknown;
  if (Array.isArray(parsed)) return { nodes: normalizeNodeArray(parsed), normalizedPackage: null };
  if (!isRecord(parsed)) throw new Error("Question tree JSON must be an array or a normalized package object.");

  const normalizedPackage = extractNormalizedPackage(parsed);
  if (normalizedPackage) {
    return { nodes: normalizePackageQuestions(normalizedPackage.questions), normalizedPackage };
  }
  if (Array.isArray(parsed.nodes)) return { nodes: normalizeNodeArray(parsed.nodes), normalizedPackage: null };
  if (Array.isArray(parsed.questions)) return { nodes: normalizePackageQuestions(parsed.questions), normalizedPackage: null };

  throw new Error("Paste a node array, a normalized package with questions, or an object with nodes/questions.");
}

function extractNormalizedPackage(value: Record<string, unknown>): NormalizedPackageLike | null {
  if (Array.isArray(value.questions)) return value as NormalizedPackageLike;
  const nested = value.normalized_package ?? value.normalized_package_json;
  if (isRecord(nested) && Array.isArray(nested.questions)) return nested as NormalizedPackageLike;
  return null;
}

function normalizePackageQuestions(questions: unknown[]) {
  const nodes: EditableQuestionNode[] = [];
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
      interaction_json: isJsonRecord(rawNode.interaction_json) ? rawNode.interaction_json : isJsonRecord(rawNode.interaction) ? rawNode.interaction : null,
    });
    if (Array.isArray(rawNode.children)) {
      rawNode.children.forEach((child, childIndex) => visit(child, childIndex, nodeKey));
    }
  }
  questions.forEach((question, index) => visit(question, index, null));
  return nodes;
}

function normalizeNodeArray(rawNodes: unknown[]) {
  return rawNodes.map((rawNode, index) => {
    if (!isRecord(rawNode)) throw new Error(`Node ${index + 1} must be an object.`);
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
      interaction_json: isJsonRecord(rawNode.interaction_json) ? rawNode.interaction_json : null,
    };
  });
}

function normalizeNodeType(value: unknown): EditableQuestionNode["node_type"] {
  return typeof value === "string" && NODE_TYPES.has(value) ? value as EditableQuestionNode["node_type"] : "question";
}

function normalizeResponseMode(value: unknown): EditableQuestionNode["response_mode"] {
  return typeof value === "string" && RESPONSE_MODES.has(value) ? value as EditableQuestionNode["response_mode"] : "typed_or_upload";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
