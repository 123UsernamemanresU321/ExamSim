import type { QuestionNode } from "@/lib/assessment-package";

export function nodeNeedsUpload(node: Pick<QuestionNode, "response_mode">): boolean {
  return node.response_mode === "upload_pdf" || node.response_mode === "typed_or_upload";
}

export function collectUploadSlotNodeIds(nodes: QuestionNode[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function visitRoot(node: QuestionNode) {
    if (node.node_type === "section") {
      for (const child of node.children ?? []) visitRoot(child);
      return;
    }

    if (node.node_type === "question" && !seen.has(node.node_id)) {
      ids.push(node.node_id);
      seen.add(node.node_id);
    }
  }

  for (const node of nodes) {
    visitRoot(node);
  }
  return ids;
}
