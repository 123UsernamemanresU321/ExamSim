"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Ban, CheckCircle2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MathRenderer } from "@/components/math-renderer";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { buildMarkingTree, flattenMarkingTree } from "@/lib/marking-tree";
import type { MarkschemeDocument, MarkschemeNode, QuestionNodeRow } from "@/types/database";

export function MarkschemeMapperPanel({
  documents,
  markschemeNodes,
  questionNodes,
}: {
  documents: MarkschemeDocument[];
  markschemeNodes: MarkschemeNode[];
  questionNodes: QuestionNodeRow[];
}) {
  const router = useRouter();
  const questionTree = buildMarkingTree(questionNodes);
  const flatQuestions = flattenMarkingTree(questionTree);
  const [selectedQuestionId, setSelectedQuestionId] = useState(flatQuestions[0]?.id ?? "");
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);

  async function updateMapping(nodeId: string, action: "map_node" | "ignore_node") {
    setBusyNodeId(nodeId);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "markscheme-mapper", {
        body: {
          action,
          markscheme_node_id: nodeId,
          question_node_id: action === "map_node" ? selectedQuestionId : undefined,
        },
        requiresAal2: true,
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update markscheme mapping.");
    } finally {
      setBusyNodeId(null);
    }
  }

  if (!documents.length) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-sm text-[var(--muted)]">
        No markscheme document has been registered for this version yet. Upload a markscheme during assessment creation,
        or paste a private Storage path into the markscheme mapper Edge workflow.
      </div>
    );
  }

  const mappedCount = markschemeNodes.filter((node) => node.status === "mapped").length;
  const unmatchedCount = markschemeNodes.filter((node) => node.status === "unmatched" || node.status === "needs_review").length;

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <aside className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--ink)]">Question target</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          Select the question node, then map markscheme sections to it. Cover and general instruction sections should be ignored.
        </p>
        <select
          value={selectedQuestionId}
          onChange={(event) => setSelectedQuestionId(event.target.value)}
          className="mt-4 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          {flatQuestions.map((node) => (
            <option key={node.id} value={node.id}>
              {"  ".repeat(node.depth ?? 0)}{node.node_key} {node.title ? `- ${node.title}` : ""}
            </option>
          ))}
        </select>
        <div className="mt-5 grid gap-2 text-xs font-semibold text-[var(--muted)]">
          <span>{documents.length} document{documents.length === 1 ? "" : "s"}</span>
          <span>{mappedCount} mapped sections</span>
          <span>{unmatchedCount} unmatched or review-required sections</span>
        </div>
      </aside>

      <section className="grid gap-3">
        {markschemeNodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-sm text-[var(--muted)]">
            No extracted markscheme sections yet. Run the markscheme parse assistant, then return here to review mapping.
          </div>
        ) : (
          markschemeNodes.map((node) => (
            <article key={node.id} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={node.status === "mapped" ? "success" : node.status === "ignored" ? "neutral" : "warning"}>
                      {node.status.replaceAll("_", " ")}
                    </Badge>
                    {node.node_key ? <span className="text-xs font-semibold text-[var(--ink)]">{node.node_key}</span> : null}
                    {node.source_page_start ? (
                      <span className="text-xs text-[var(--muted)]">page {node.source_page_start}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    Confidence {node.confidence === null ? "unknown" : `${Math.round(node.confidence * 100)}%`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-2"
                    disabled={busyNodeId === node.id || !selectedQuestionId}
                    onClick={() => updateMapping(node.id, "map_node")}
                  >
                    {node.status === "mapped" ? <CheckCircle2 size={14} /> : <Link2 size={14} />}
                    Map
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-2"
                    disabled={busyNodeId === node.id}
                    onClick={() => updateMapping(node.id, "ignore_node")}
                  >
                    <Ban size={14} />
                    Ignore
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4">
                {node.markscheme_html ? (
                  <MathRenderer html={node.markscheme_html} />
                ) : (
                  <p className="text-sm italic text-[var(--muted)]">No markscheme text was extracted for this section.</p>
                )}
              </div>
              {node.mapped_question_node_id ? (
                <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-green-700">
                  <ArrowRight size={13} />
                  Mapped to {flatQuestions.find((question) => question.id === node.mapped_question_node_id)?.node_key ?? "selected question"}
                </p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
