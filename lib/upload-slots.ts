import type { QuestionNode } from "@/lib/assessment-package";

export function nodeNeedsUpload(node: Pick<QuestionNode, "response_mode">): boolean {
  return node.response_mode === "upload_pdf" || node.response_mode === "typed_or_upload";
}

export function collectUploadSlotNodeIds(nodes: QuestionNode[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function visit(node: QuestionNode) {
    if (nodeNeedsUpload(node) && !seen.has(node.node_id)) {
      ids.push(node.node_id);
      seen.add(node.node_id);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  for (const node of nodes) {
    visit(node);
  }
  return ids;
}
