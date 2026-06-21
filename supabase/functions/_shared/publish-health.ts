type QuestionNode = {
  id: string;
  node_key: string;
  node_type: string;
  marks: number | null;
  response_mode: string | null;
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
}: {
  questionNodes: QuestionNode[];
  sourceRegions: SourceRegion[];
  markschemeNodes: MarkschemeNode[];
}) {
  const blockers: string[] = [];
  const markableNodes = questionNodes.filter((node) => ["question", "subquestion", "part"].includes(node.node_type));
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
    if (!node.response_mode || node.response_mode === "none") {
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

  const unresolvedMarkscheme = markschemeNodes.filter((node) =>
    node.status === "unmatched" || node.status === "needs_review" || !node.mapped_question_node_id
  );
  if (unresolvedMarkscheme.length) {
    blockers.push(`${unresolvedMarkscheme.length} markscheme item(s) remain unresolved.`);
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
