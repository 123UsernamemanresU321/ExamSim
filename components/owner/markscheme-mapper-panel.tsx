"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Ban, CheckCheck, CheckCircle2, Link2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MathRenderer } from "@/components/math-renderer";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { buildMarkingTree, flattenMarkingTree } from "@/lib/marking-tree";
import type { MarkschemeDocument, MarkschemeNode, QuestionNodeRow } from "@/types/database";

export function MarkschemeMapperPanel({
  assessmentId,
  assessmentVersionId,
  markschemeSourceObjectPath,
  documents,
  markschemeNodes,
  questionNodes,
}: {
  assessmentId: string;
  assessmentVersionId: string;
  markschemeSourceObjectPath: string | null;
  documents: MarkschemeDocument[];
  markschemeNodes: MarkschemeNode[];
  questionNodes: QuestionNodeRow[];
}) {
  const router = useRouter();
  const questionTree = buildMarkingTree(questionNodes);
  const flatQuestions = flattenMarkingTree(questionTree);
  const [selectedQuestionId, setSelectedQuestionId] = useState(flatQuestions[0]?.id ?? "");
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [manualNodeKey, setManualNodeKey] = useState("");
  const [manualMarkscheme, setManualMarkscheme] = useState("");

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

  async function runDocumentAction(action: "bootstrap_document" | "approve_document_mappings", documentId: string) {
    setBusyAction(action);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "markscheme-mapper", {
        body: { action, markscheme_document_id: documentId },
        requiresAal2: true,
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not update the markscheme document.");
    } finally {
      setBusyAction(null);
    }
  }

  async function registerUploadedMarkscheme() {
    if (!markschemeSourceObjectPath) return;
    setBusyAction("create_document");
    try {
      const supabase = createSupabaseBrowserClient();
      const result = await invokeEdgeFunction<{ document?: { id?: string } }>(supabase, "markscheme-mapper", {
        body: {
          action: "create_document",
          assessment_id: assessmentId,
          assessment_version_id: assessmentVersionId,
          source_object_path: markschemeSourceObjectPath,
        },
        requiresAal2: true,
      });
      const documentId = result?.document?.id;
      if (documentId) {
        await invokeEdgeFunction(supabase, "markscheme-mapper", {
          body: { action: "bootstrap_document", markscheme_document_id: documentId },
          requiresAal2: true,
        });
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not register the uploaded markscheme.");
    } finally {
      setBusyAction(null);
    }
  }

  async function addManualBlock(documentId: string) {
    if (!manualMarkscheme.trim() || !selectedQuestionId) return;
    setBusyAction("upsert_node");
    try {
      const supabase = createSupabaseBrowserClient();
      const selectedQuestion = flatQuestions.find((question) => question.id === selectedQuestionId);
      await invokeEdgeFunction(supabase, "markscheme-mapper", {
        body: {
          action: "upsert_node",
          markscheme_document_id: documentId,
          node_key: manualNodeKey.trim() || selectedQuestion?.node_key || null,
          mapped_question_node_id: selectedQuestionId,
          markscheme_html: `<p>${escapeHtml(manualMarkscheme.trim())}</p>`,
          confidence: 1,
          status: "mapped",
        },
        requiresAal2: true,
      });
      setManualNodeKey("");
      setManualMarkscheme("");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not add the markscheme block.");
    } finally {
      setBusyAction(null);
    }
  }

  if (!documents.length) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-white p-6">
        <h2 className="text-base font-semibold text-[var(--ink)]">Register the uploaded markscheme</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          {markschemeSourceObjectPath
            ? "The private PDF is attached to this assessment, but its mapping workspace has not been registered. Register it to recover reviewed question-level markscheme guidance and continue mapping."
            : "No markscheme source is attached to this version. Return to assessment creation or authoring to upload one."}
        </p>
        {markschemeSourceObjectPath ? (
          <Button type="button" className="mt-4 gap-2" disabled={busyAction !== null} onClick={registerUploadedMarkscheme}>
            <Plus size={15} />
            {busyAction === "create_document" ? "Registering..." : "Register uploaded markscheme"}
          </Button>
        ) : null}
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
        <div className="mt-5 grid gap-2 border-t border-[var(--border)] pt-4">
          <Button
            type="button"
            variant="secondary"
            className="justify-start gap-2"
            disabled={busyAction !== null}
            onClick={() => runDocumentAction("bootstrap_document", documents[0]!.id)}
          >
            <RefreshCw size={14} />
            Build mapping suggestions
          </Button>
          {markschemeNodes.length ? (
            <Button
              type="button"
              className="justify-start gap-2"
              disabled={busyAction !== null}
              onClick={() => runDocumentAction("approve_document_mappings", documents[0]!.id)}
            >
              <CheckCheck size={14} />
              Confirm all suggested mappings
            </Button>
          ) : null}
        </div>
      </aside>

      <section className="grid gap-3">
        {markschemeNodes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">
            No extracted markscheme sections yet. Build deterministic suggestions from reviewed question cards, retry the provider parser, or add a block manually below.
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
        <div className="rounded-lg border border-[var(--border)] bg-white p-5">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Add a block manually</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Use this when OCR is unavailable or the provider omitted a markscheme section.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              Question label
              <input value={manualNodeKey} onChange={(event) => setManualNodeKey(event.target.value)} placeholder="1(a)" className="rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal text-[var(--ink)]" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              Markscheme guidance
              <textarea value={manualMarkscheme} onChange={(event) => setManualMarkscheme(event.target.value)} rows={2} placeholder="M1 for a correct method..." className="resize-y rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal text-[var(--ink)]" />
            </label>
            <Button type="button" className="gap-2" disabled={busyAction !== null || !manualMarkscheme.trim() || !selectedQuestionId} onClick={() => addManualBlock(documents[0]!.id)}>
              <Plus size={14} /> Add block
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
