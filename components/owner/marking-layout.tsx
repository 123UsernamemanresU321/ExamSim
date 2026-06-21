"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle2, Loader2 } from "lucide-react";
import type { AttemptReviewWorkspace } from "@/lib/live-data";
import { buildMarkingTree, findMarkingTreeNode, getMarkableLeafNodes, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { buildRootQuestionMarkingContext } from "@/lib/marking-context-core";
import { MarkingSidebarTree } from "./marking-sidebar-tree";
import { MarkingCenterPanel } from "./marking-center-panel";
import { MarkingDiscussionWorkspace, MarkingResponseWorkspace } from "./marking-response-workspace";
import { MarkingModerationPanel } from "./marking-moderation-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function MarkingLayout({ workspace, attemptId }: { workspace: AttemptReviewWorkspace; attemptId: string }) {
  const router = useRouter();
  const questionTree = buildMarkingTree(workspace.questionNodes);
  const selectableGroups = getSelectableMarkingGroups(questionTree);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    selectableGroups[0]?.id ?? null
  );
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [releaseChecklist, setReleaseChecklist] = useState({ marks_reviewed: false, feedback_reviewed: false, visibility_reviewed: false });

  const selectedNode = findMarkingTreeNode(questionTree, selectedNodeId) ?? selectableGroups[0] ?? null;
  const markingContext = buildRootQuestionMarkingContext(workspace, selectedNode?.id ?? null);
  const selectedLeafNodes = markingContext.markableLeafNodes.length ? markingContext.markableLeafNodes : selectedNode ? getMarkableLeafNodes(selectedNode) : [];
  const selectedRootUploadSlot = markingContext.uploadSlot ?? undefined;

  async function handleRelease() {
    if (!Object.values(releaseChecklist).every(Boolean)) return;

    setIsReleasing(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "release-feedback", {
        body: { attempt_id: attemptId, release_checklist: releaseChecklist },
        requiresAal2: true,
      });
      router.refresh();
      setReleaseDialogOpen(false);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Release failed", error);
      }
      alert("Failed to release marks: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsReleasing(false);
    }
  }

  return (
    <div className="flex h-full gap-4 overflow-hidden p-1">
      {/* Left Panel: Question Tree */}
      <aside className="w-72 flex-shrink-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm">
        <MarkingSidebarTree
          questionNodes={workspace.questionNodes}
          selectedNodeId={selectedNodeId}
          onSelect={setSelectedNodeId}
          marks={workspace.marks}
          uploadSlots={workspace.uploadSlots}
          textResponses={workspace.textResponses}
          annotations={workspace.annotations}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex flex-1 gap-4 overflow-hidden">
        <Tabs defaultValue="marking" className="flex flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between px-1">
            <TabsList>
              <TabsTrigger value="marking">Marking & Annotations</TabsTrigger>
              <TabsTrigger value="moderation">Moderation & Timeline</TabsTrigger>
              <TabsTrigger value="discussion">Discussion / Appeals</TabsTrigger>
            </TabsList>

            <Button
              variant={workspace.feedbackRelease ? "secondary" : "primary"}
              onClick={() => setReleaseDialogOpen(true)}
              disabled={isReleasing}
              className="gap-2 font-semibold uppercase tracking-widest text-[10px] h-9"
            >
              {isReleasing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : workspace.feedbackRelease ? (
                <CheckCircle2 size={14} className="text-green-600" />
              ) : (
                <Send size={14} />
              )}
              {workspace.feedbackRelease ? "Results Released" : "Release Results"}
            </Button>
          </div>

          <TabsContent value="marking" className="flex-1 mt-0 overflow-hidden">
            <div className="flex flex-col h-full gap-4">
              {/* Top Panel: Question & Markscheme */}
              <section className="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm p-8">
                <MarkingCenterPanel
                  node={selectedNode}
                  marks={workspace.marks}
                  markschemeHtml={markingContext.mappedMarkschemeNodes.length ? markingContext.mappedMarkschemeNodes.map((node) => node.html).filter(Boolean).join("<hr />") : workspace.markschemeHtml}
                  markschemePdfPath={workspace.markschemePdfPath}
                  sourceObjectPath={workspace.sourceObjectPath}
                  sourcePageRanges={markingContext.sourcePageRanges}
                  visualWarnings={markingContext.visualWarnings}
                />
              </section>

              {/* Bottom Panel: Response & Controls */}
              <section className="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm p-6">
                <MarkingResponseWorkspace
                  key={selectedNodeId ?? "none"}
                  attemptId={attemptId}
                  rootNode={selectedNode ?? undefined}
                  rootSlot={selectedRootUploadSlot}
                  nodes={selectedLeafNodes}
                  responses={workspace.textResponses}
                  marks={workspace.marks}
                  annotations={workspace.annotations}
                  workAnnotations={workspace.workAnnotations}
                  uploadSanityChecks={workspace.uploadSanityChecks}
                  commentBank={workspace.commentBank}
                  rubricTemplates={workspace.rubricTemplates}
                  rubricTemplateItems={workspace.rubricTemplateItems}
                  rubricItemAwards={workspace.rubricItemAwards}
                  markingTickets={workspace.markingTickets}
                  markingTicketMessages={workspace.markingTicketMessages}
                  showDiscussion={false}
                  studentName={workspace.attempt?.student ?? "Student"}
                  assessmentTitle={workspace.attempt?.title ?? "Assessment"}
                  paperCode={workspace.attempt?.paper_code ?? null}
                  releaseStatus={workspace.feedbackRelease ? "Released" : "Draft"}
                />
              </section>
            </div>
          </TabsContent>

          <TabsContent value="moderation" className="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm p-6 mt-0">
            <MarkingModerationPanel
              report={workspace.moderationReport}
              events={workspace.attemptEvents}
            />
          </TabsContent>

          <TabsContent value="discussion" className="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm p-6 mt-0">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ink)]">Discussion / Appeals</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  Use this separate workspace for student questions, marking disputes, and clarification threads. Marking and annotation controls stay in the Marking tab.
                </p>
              </div>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {workspace.markingTickets.length} open or archived tickets
              </span>
            </div>
            <MarkingDiscussionWorkspace
              attemptId={attemptId}
              nodes={selectedLeafNodes}
              markingTickets={workspace.markingTickets}
              markingTicketMessages={workspace.markingTicketMessages}
            />
          </TabsContent>
        </Tabs>
      </main>
      {releaseDialogOpen ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Feedback release checklist">
          <div className="w-full max-w-lg rounded-[4px] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-popover)]">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Release checklist</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Confirm the final student-visible record. The server also rejects any markable question without a saved mark.</p>
            <div className="mt-5 grid gap-3">
              <ReleaseCheck
                checked={releaseChecklist.marks_reviewed}
                label="Every question has a saved mark, including zero for unanswered work."
                onChange={(checked) => setReleaseChecklist((current) => ({ ...current, marks_reviewed: checked }))}
              />
              <ReleaseCheck
                checked={releaseChecklist.feedback_reviewed}
                label="Student feedback and annotations have been reviewed."
                onChange={(checked) => setReleaseChecklist((current) => ({ ...current, feedback_reviewed: checked }))}
              />
              <ReleaseCheck
                checked={releaseChecklist.visibility_reviewed}
                label="Private marker notes are not included in the student-visible release."
                onChange={(checked) => setReleaseChecklist((current) => ({ ...current, visibility_reviewed: checked }))}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReleaseDialogOpen(false)} disabled={isReleasing}>Cancel</Button>
              <Button type="button" onClick={() => void handleRelease()} disabled={isReleasing || !Object.values(releaseChecklist).every(Boolean)} isLoading={isReleasing}>
                {workspace.feedbackRelease ? "Re-release results" : "Release results"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReleaseCheck({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm leading-6">
      <input className="mt-1" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
