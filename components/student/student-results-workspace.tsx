"use client";

import { useState } from "react";
import type { AttemptReviewWorkspace } from "@/lib/live-data";
import { MarkingSidebarTree } from "@/components/owner/marking-sidebar-tree";
import { MarkingCenterPanel } from "@/components/owner/marking-center-panel";
import { MathRenderer } from "@/components/math-renderer";
import { formatStoredResponse } from "@/lib/response-values";
import { buildMarkingTree, computeMarkingTotals, findMarkingTreeNode, getMarkableLeafNodes, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { FileText, MessageSquare, Award, AlertCircle } from "lucide-react";

export function StudentResultsWorkspace({ workspace }: { workspace: AttemptReviewWorkspace; attemptId: string }) {
  const questionTree = buildMarkingTree(workspace.questionNodes);
  const selectableGroups = getSelectableMarkingGroups(questionTree);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    selectableGroups[0]?.id ?? null
  );

  const selectedNode = findMarkingTreeNode(questionTree, selectedNodeId) ?? selectableGroups[0] ?? null;
  const selectedLeaves = selectedNode ? getMarkableLeafNodes(selectedNode) : [];
  const totals = selectedNode ? computeMarkingTotals(selectedNode, workspace.marks) : null;

  return (
    <div className="flex h-full gap-8 overflow-hidden">
      {/* Navigation Tree */}
      <aside className="w-80 flex-shrink-0 overflow-y-auto rounded-2xl border border-[var(--border)] bg-slate-50/30 p-2">
        <MarkingSidebarTree
          questionNodes={workspace.questionNodes}
          selectedNodeId={selectedNodeId}
          onSelect={setSelectedNodeId}
          marks={workspace.marks}
          uploadSlots={workspace.uploadSlots}
          textResponses={workspace.textResponses}
          annotations={[]} // Students don't see internal flags
        />
      </aside>

      {/* Main Content Vertical Stack */}
      <main className="flex flex-1 flex-col gap-6 overflow-hidden">
        {/* Top: Question Content */}
        <section className="flex-1 overflow-y-auto rounded-2xl border border-[var(--border)] bg-white p-10 shadow-sm">
          <MarkingCenterPanel
            node={selectedNode}
            marks={workspace.marks}
            markschemeHtml={workspace.markschemeHtml}
            markschemePdfPath={workspace.markschemePdfPath}
            assetSigningMode="none"
          />
        </section>

        {/* Bottom: Student Response & Feedback */}
        <section className="flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
           <div className="flex h-full overflow-hidden">
              {/* Left: Your Answer */}
              <div className="flex-1 overflow-y-auto border-r border-[var(--border)] p-8 space-y-6">
                 <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--subtle)]">
                   <FileText size={14} /> Your Submission
                 </div>
                 {selectedLeaves.length > 0 ? (
                   <div className="space-y-4">
                     {selectedLeaves.map((leaf) => {
                       const response = workspace.textResponses.find((item) => item.question_node_id === leaf.id);
                       return (
                         <div key={leaf.id} className="rounded-xl border border-[var(--border)] bg-slate-50/50 p-6">
                           <div className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--subtle)]">{leaf.node_key}</div>
                           {response?.answer_text ? (
                             <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-[var(--ink)]">
                               {formatStoredResponse(response.answer_text, leaf)}
                             </p>
                           ) : (
                             <p className="text-sm italic text-[var(--muted)]">No digital response recorded for this part.</p>
                           )}
                         </div>
                       );
                     })}
                   </div>
                 ) : (
                   <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[var(--muted)] italic text-sm">
                     No digital response recorded for this question.
                   </div>
                 )}
              </div>

              {/* Right: Marks & Feedback */}
              <div className="w-[420px] flex-shrink-0 overflow-y-auto bg-slate-50/30 p-8 space-y-8">
                {/* Score */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--subtle)]">
                    <Award size={14} /> Points Awarded
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black italic tracking-tighter text-[var(--primary)]">
                      {totals?.awarded ?? 0}
                    </span>
                    <span className="text-xl font-bold text-[var(--subtle)]">/ {totals?.max ?? 0}</span>
                  </div>
                </div>

                {/* Feedback */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600">
                    <MessageSquare size={14} /> Teacher&apos;s Feedback
                  </div>
                  {selectedLeaves.some((leaf) => workspace.annotations.some((a) => a.question_node_id === leaf.id && a.annotation_type === "feedback")) ? (
                    <div className="space-y-3">
                      {selectedLeaves.flatMap((leaf) =>
                        workspace.annotations
                          .filter((a) => a.question_node_id === leaf.id && a.annotation_type === "feedback")
                          .map((f) => (
                            <div key={f.id} className="rounded-xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm text-[15px] leading-relaxed text-blue-900">
                              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-blue-400">{leaf.node_key}</div>
                              <MathRenderer html={f.body} />
                            </div>
                          )),
                      )}
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-blue-100 text-blue-400 italic text-sm text-center px-6">
                      No specific comments for this question.
                    </div>
                  )}
                </div>

                {/* Internal Marker Notes (Optional - usually hidden but user might want it if mark.notes exists) */}
                {selectedLeaves.some((leaf) => workspace.marks.some((mark) => mark.question_node_id === leaf.id && mark.notes)) ? (
                  <div className="space-y-4 pt-4 opacity-75">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--subtle)]">
                      <AlertCircle size={14} /> Marking Notes
                    </div>
                    {selectedLeaves.flatMap((leaf) =>
                      workspace.marks
                        .filter((mark) => mark.question_node_id === leaf.id && mark.notes)
                        .map((mark) => (
                          <div key={mark.id} className="rounded-xl border border-[var(--border)] bg-white p-4 text-xs italic text-[var(--muted)]">
                            <strong>{leaf.node_key}: </strong>{mark.notes}
                          </div>
                        )),
                    )}
                  </div>
                ) : null}
              </div>
           </div>
        </section>
      </main>
    </div>
  );
}
