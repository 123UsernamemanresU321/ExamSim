"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttemptReviewWorkspace } from "@/lib/live-data";
import { MarkingSidebarTree } from "@/components/owner/marking-sidebar-tree";
import { MarkingCenterPanel } from "@/components/owner/marking-center-panel";
import { MathRenderer } from "@/components/math-renderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { formatStoredResponse } from "@/lib/response-values";
import { buildMarkingTree, computeMarkingTotals, findMarkingTreeNode, getMarkableLeafNodes, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { cn } from "@/lib/utils";
import type { MarkingTicket, MarkingTicketMessage, QuestionNodeRow, TextResponse, UploadSlot, WorkAnnotation } from "@/types/database";
import { FileText, MessageSquare, Award, AlertCircle, ExternalLink, Send } from "lucide-react";

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
                       const slot = workspace.uploadSlots.find((item) => item.question_node_id === leaf.id);
                       const annotations = workspace.workAnnotations.filter((item) => item.question_node_id === leaf.id && item.visibility === "student_visible");
                       const tickets = workspace.markingTickets.filter((item) => item.question_node_id === leaf.id);
                       return (
                         <div key={leaf.id} className="rounded-xl border border-[var(--border)] bg-slate-50/50 p-6">
                           <div className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--subtle)]">{leaf.node_key}</div>
                           <StudentSubmissionBlock
                             node={leaf}
                             response={response}
                             slot={slot}
                             signedUrl={slot?.id ? workspace.uploadUrls[slot.id] : undefined}
                           />
                           <StudentWorkAnnotations annotations={annotations} />
                           <StudentTicketPanel
                             attemptId={workspace.attempt?.id ?? ""}
                             node={leaf}
                             tickets={tickets}
                             messages={workspace.markingTicketMessages}
                           />
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

function StudentSubmissionBlock({
  node,
  response,
  slot,
  signedUrl,
}: {
  node: QuestionNodeRow;
  response?: TextResponse;
  slot?: UploadSlot;
  signedUrl?: string;
}) {
  const formatted = response?.answer_text ? formatStoredResponse(response.answer_text, node) : null;

  return (
    <div className="grid gap-4">
      {formatted ? (
        <div className="rounded-lg border border-white bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <FileText size={12} /> Your typed work
          </div>
          <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-[var(--ink)]">{formatted}</p>
        </div>
      ) : null}

      {slot?.object_path ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Your uploaded PDF</p>
              <p className="text-xs leading-5 text-blue-800/70">
                This is your original submitted file. Marker annotations below are separate from your work.
              </p>
            </div>
            {signedUrl ? (
              <Button variant="secondary" className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white" onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLink size={14} /> Open
              </Button>
            ) : null}
          </div>
          {signedUrl ? (
            <iframe title={`Uploaded answer for ${node.node_key}`} src={signedUrl} className="h-[460px] w-full rounded-lg border border-blue-100 bg-white" />
          ) : (
            <div className="rounded-lg border border-dashed border-blue-100 bg-white/60 p-5 text-sm italic text-blue-700">
              Upload recorded. The preview link has expired or is not available; refresh the results page to request a new short-lived link.
            </div>
          )}
        </div>
      ) : null}

      {!formatted && !slot?.object_path ? (
        <p className="text-sm italic text-[var(--muted)]">No digital response recorded for this part.</p>
      ) : null}
    </div>
  );
}

function StudentWorkAnnotations({ annotations }: { annotations: WorkAnnotation[] }) {
  if (!annotations.length) return null;

  return (
    <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
      <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest text-amber-700">Marker annotations on your work</h4>
      <div className="grid gap-3">
        {annotations.map((annotation) => (
          <div key={annotation.id} className="rounded-md border border-amber-100 bg-white p-3">
            <div className="mb-1 flex items-center gap-2">
              <Badge tone={annotation.severity === "critical" || annotation.severity === "major" ? "warning" : "neutral"} className="text-[10px] uppercase">
                {annotation.severity}
              </Badge>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                {annotation.annotation_kind.replaceAll("_", " ")}
              </span>
            </div>
            {renderStudentAnchor(annotation.anchor_json)}
            <p className="text-sm leading-6 text-[var(--ink)]">{annotation.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StudentTicketPanel({
  attemptId,
  node,
  tickets,
  messages,
}: {
  attemptId: string;
  node: QuestionNodeRow;
  tickets: MarkingTicket[];
  messages: MarkingTicketMessage[];
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyByTicket, setReplyByTicket] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  async function openTicket() {
    if (!attemptId || !subject.trim() || !message.trim()) return;
    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "marking-ticket", {
        body: {
          action: "create",
          attempt_id: attemptId,
          question_node_id: node.id,
          subject: subject.trim(),
          message: message.trim(),
        },
      });
      setSubject("");
      setMessage("");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not open discussion ticket.");
    } finally {
      setIsSaving(false);
    }
  }

  async function reply(ticketId: string) {
    const replyText = replyByTicket[ticketId]?.trim();
    if (!replyText) return;
    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "marking-ticket", {
        body: { action: "reply", ticket_id: ticketId, message: replyText },
      });
      setReplyByTicket((prev) => ({ ...prev, [ticketId]: "" }));
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not send reply.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-blue-100 bg-white p-4">
      <h4 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
        <MessageSquare size={13} /> Mark discussion
      </h4>
      <p className="mb-4 text-xs leading-5 text-[var(--muted)]">
        Ask for clarification about this part. This does not change your submitted answer; it opens a review thread for the marker.
      </p>

      {tickets.length ? (
        <div className="mb-4 grid gap-3">
          {tickets.map((ticket) => {
            const ticketMessages = messages.filter((item) => item.ticket_id === ticket.id);
            return (
              <div key={ticket.id} className="rounded-lg border border-blue-100 bg-blue-50/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--ink)]">{ticket.subject}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">{ticket.status.replaceAll("_", " ")}</p>
                  </div>
                  <Badge tone={ticket.status === "resolved" || ticket.status === "closed" ? "success" : "accent"}>
                    {ticket.status === "owner_review" ? "Awaiting marker" : ticket.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <div className="mb-3 grid gap-2">
                  {ticketMessages.map((ticketMessage) => (
                    <div
                      key={ticketMessage.id}
                      className={cn(
                        "rounded-md p-2 text-xs leading-5",
                        ticketMessage.author_role === "student" ? "bg-white text-slate-800" : "bg-blue-100 text-blue-950",
                      )}
                    >
                      <span className="font-black uppercase tracking-widest">
                        {ticketMessage.author_role === "student" ? "You" : "Marker"}:{" "}
                      </span>
                      {ticketMessage.body}
                    </div>
                  ))}
                </div>
                {ticket.status !== "closed" ? (
                  <div className="grid gap-2">
                    <Textarea
                      value={replyByTicket[ticket.id] ?? ""}
                      onChange={(event) => setReplyByTicket((prev) => ({ ...prev, [ticket.id]: event.target.value }))}
                      placeholder="Reply to this discussion..."
                    />
                    <Button type="button" onClick={() => void reply(ticket.id)} disabled={isSaving || !replyByTicket[ticket.id]?.trim()} className="justify-self-start text-white">
                      <Send size={14} /> Reply
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-2">
        <input
          className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder={`Question about ${node.node_key}`}
        />
        <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Explain what you want reviewed or clarified." />
        <Button type="button" onClick={() => void openTicket()} disabled={isSaving || !subject.trim() || !message.trim()} className="justify-self-start text-white">
          <MessageSquare size={14} /> Open discussion
        </Button>
      </div>
    </section>
  );
}

function renderStudentAnchor(anchor: unknown) {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return null;
  const value = anchor as { selected_text?: unknown; page?: unknown; location_label?: unknown; annotation_tool?: unknown; x?: unknown; y?: unknown };
  if (typeof value.selected_text === "string" && value.selected_text.trim()) {
    return <blockquote className="mb-2 border-l-2 border-amber-300 pl-3 text-xs italic text-slate-600">{value.selected_text}</blockquote>;
  }
  if (value.page || value.location_label || value.annotation_tool) {
    return (
      <p className="mb-2 text-xs font-semibold text-slate-500">
        {value.annotation_tool ? `${String(value.annotation_tool).replaceAll("_", " ")} · ` : ""}
        Page/view {String(value.page ?? "?")}
        {value.location_label ? ` · ${String(value.location_label)}` : ""}
        {typeof value.x === "number" && typeof value.y === "number" ? ` · ${Math.round(value.x)}%, ${Math.round(value.y)}%` : ""}
      </p>
    );
  }
  return null;
}
