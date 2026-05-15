"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle2, Loader2 } from "lucide-react";
import type { AttemptReviewWorkspace } from "@/lib/live-data";
import { buildMarkingTree, findMarkingTreeNode, getMarkableLeafNodes, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { MarkingSidebarTree } from "./marking-sidebar-tree";
import { MarkingCenterPanel } from "./marking-center-panel";
import { MarkingResponseWorkspace } from "./marking-response-workspace";
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

  const selectedNode = findMarkingTreeNode(questionTree, selectedNodeId) ?? selectableGroups[0] ?? null;
  const selectedLeafNodes = selectedNode ? getMarkableLeafNodes(selectedNode) : [];

  async function handleRelease() {
    if (workspace.feedbackRelease) {
      if (!confirm("Feedback has already been released. Do you want to re-release with updated marks?")) return;
    } else {
      if (!confirm("Are you sure you want to release these marks to the student? This will make the score and feedback visible on their dashboard.")) return;
    }

    setIsReleasing(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "release-feedback", {
        body: { attempt_id: attemptId },
        requiresAal2: true,
      });
      router.refresh();
    } catch (error) {
      console.error("Release failed", error);
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
              <TabsTrigger value="marking">Marking</TabsTrigger>
              <TabsTrigger value="moderation">Moderation & Timeline</TabsTrigger>
            </TabsList>

            <Button
              variant={workspace.feedbackRelease ? "secondary" : "primary"}
              onClick={handleRelease}
              disabled={isReleasing}
              className="gap-2 font-black uppercase tracking-widest text-[10px] h-9"
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
                  markschemeHtml={workspace.markschemeHtml}
                  markschemePdfPath={workspace.markschemePdfPath}
                />
              </section>

              {/* Bottom Panel: Response & Controls */}
              <section className="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm p-6">
                <MarkingResponseWorkspace
                  key={selectedNodeId ?? "none"}
                  attemptId={attemptId}
                  nodes={selectedLeafNodes}
                  responses={workspace.textResponses}
                  uploadSlots={workspace.uploadSlots}
                  marks={workspace.marks}
                  annotations={workspace.annotations}
                  workAnnotations={workspace.workAnnotations}
                  markingTickets={workspace.markingTickets}
                  markingTicketMessages={workspace.markingTicketMessages}
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
        </Tabs>
      </main>
    </div>
  );
}
