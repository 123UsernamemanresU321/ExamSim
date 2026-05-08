"use client";

import { useState } from "react";
import type { AttemptReviewWorkspace } from "@/lib/live-data";
import { MarkingSidebarTree } from "./marking-sidebar-tree";
import { MarkingCenterPanel } from "./marking-center-panel";
import { MarkingResponseWorkspace } from "./marking-response-workspace";
import { MarkingModerationPanel } from "./marking-moderation-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function MarkingLayout({ workspace, attemptId }: { workspace: AttemptReviewWorkspace; attemptId: string }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    workspace.questionNodes.find((n) => n.node_type !== "section")?.id ?? null
  );

  const selectedNode = workspace.questionNodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4 overflow-hidden p-1">
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
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="marking">Marking</TabsTrigger>
              <TabsTrigger value="moderation">Moderation & Timeline</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="marking" className="flex-1 overflow-hidden mt-0">
            <div className="flex h-full gap-4">
              {/* Center Panel: Question & Markscheme */}
              <section className="flex-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm p-6">
                <MarkingCenterPanel
                  node={selectedNode}
                  markschemeHtml={workspace.markschemeHtml}
                  markschemePdfPath={workspace.markschemePdfPath}
                />
              </section>

              {/* Right Panel: Response & Controls */}
              <section className="w-[480px] flex-shrink-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white shadow-sm p-6">
                <MarkingResponseWorkspace
                  attemptId={attemptId}
                  node={selectedNode}
                  response={workspace.textResponses.find((r) => r.question_node_id === selectedNodeId)}
                  slot={workspace.uploadSlots.find((s) => s.question_node_id === selectedNodeId)}
                  mark={workspace.marks.find((m) => m.question_node_id === selectedNodeId)}
                  annotations={workspace.annotations.filter((a) => a.question_node_id === selectedNodeId)}
                  commentBank={workspace.commentBank}
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
