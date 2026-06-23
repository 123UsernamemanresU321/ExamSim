type QuestionNode = {
  id: string;
  node_key: string;
  node_type: string;
  marks: number | null;
  response_mode: string | null;
  parent_node_id?: string | null;
  root_question_id?: string | null;
  depth?: number | null;
  ordinal_path?: number[] | null;
};

type SourceRegion = {
  id: string;
  question_node_id: string | null;
  region_type: string;
  status: string;
  confidence: number | null;
  metadata_json?: unknown;
};

type MarkschemeNode = {
  status: string;
  mapped_question_node_id: string | null;
};

export function validatePublishHealth({
  questionNodes,
  sourceRegions,
  markschemeNodes,
  markschemeRequired = false,
  markschemeDocumentCount = 0,
}: {
  questionNodes: QuestionNode[];
  sourceRegions: SourceRegion[];
  markschemeNodes: MarkschemeNode[];
  markschemeRequired?: boolean;
  markschemeDocumentCount?: number;
}) {
  const blockers: string[] = [];
  const markableNodes = questionNodes.filter((node) => ["question", "subquestion", "part"].includes(node.node_type));
  const responseOwnerIds = buildResponseOwnerIds(questionNodes);
  if (!markableNodes.length) blockers.push("No markable questions exist.");

  const seenKeys = new Set<string>();
  for (const node of questionNodes) {
    const key = node.node_key.trim().toLowerCase();
    if (seenKeys.has(key)) blockers.push(`Duplicate question key: ${node.node_key}.`);
    seenKeys.add(key);
  }

  for (const node of markableNodes) {
    if (node.marks === null || !Number.isFinite(Number(node.marks)) || Number(node.marks) <= 0) {
      blockers.push(`${node.node_key} is missing a positive mark value.`);
    }
    if (!responseOwnerIds.get(node.id)) {
      blockers.push(`${node.node_key} is missing a confirmed response type.`);
    }
  }

  for (const region of sourceRegions) {
    if (region.status === "ignored") continue;
    const metadata = safeRecord(region.metadata_json);
    const confidence = firstNumber(region.confidence, metadata.confidence, metadata.parse_confidence);
    if ((region.status === "detected" || region.status === "needs_review") && (confidence === null || confidence < 0.6)) {
      blockers.push(`Source region ${region.id} has critical low-confidence output that has not been reviewed.`);
    }
    if (["question", "subquestion", "answer_area"].includes(region.region_type) && !region.question_node_id) {
      blockers.push(`Source region ${region.id} is not linked to a question.`);
    }
  }

  if (markschemeRequired && markschemeDocumentCount === 0) {
    blockers.push("The uploaded markscheme has no registered markscheme document.");
  } else if (markschemeRequired && markschemeNodes.length === 0) {
    blockers.push("The registered markscheme document has no mapping sections.");
  } else {
    const unresolvedMarkscheme = markschemeNodes.filter((node) =>
      node.status === "unmatched" || node.status === "needs_review" || !node.mapped_question_node_id
    );
    if (unresolvedMarkscheme.length) blockers.push(`${unresolvedMarkscheme.length} markscheme item(s) remain unresolved.`);
  }

  return Array.from(new Set(blockers));
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function buildResponseOwnerIds(nodes: QuestionNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byKey = new Map(nodes.map((node) => [node.node_key.trim().toLowerCase(), node]));
  const rootsByOrdinal = new Map<number, QuestionNode>();
  for (const node of nodes) {
    const path = Array.isArray(node.ordinal_path) ? node.ordinal_path : [];
    if (Number(node.depth ?? path.length - 1) === 0 && typeof path[0] === "number") rootsByOrdinal.set(path[0], node);
  }

  const owners = new Map<string, string | null>();
  function resolve(node: QuestionNode, visiting = new Set<string>()): string | null {
    if (owners.has(node.id)) return owners.get(node.id) ?? null;
    if (node.response_mode && node.response_mode !== "none") {
      owners.set(node.id, node.id);
      return node.id;
    }
    if (visiting.has(node.id)) return null;
    visiting.add(node.id);

    const parent = node.parent_node_id ? byId.get(node.parent_node_id) : null;
    const path = Array.isArray(node.ordinal_path) ? node.ordinal_path : [];
    const rootReference = String(node.root_question_id ?? "").trim();
    const root = rootReference
      ? byId.get(rootReference) ?? byKey.get(rootReference.toLowerCase())
      : typeof path[0] === "number"
        ? rootsByOrdinal.get(path[0])
        : null;
    for (const ancestor of [parent, root]) {
      if (!ancestor || ancestor.id === node.id) continue;
      const owner = resolve(ancestor, visiting);
      if (owner) {
        owners.set(node.id, owner);
        return owner;
      }
    }
    owners.set(node.id, null);
    return null;
  }

  for (const node of nodes) resolve(node);
  return owners;
}
