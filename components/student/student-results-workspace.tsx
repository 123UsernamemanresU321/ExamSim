"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttemptReviewWorkspace } from "@/lib/live-data";
import { MarkingSidebarTree } from "@/components/owner/marking-sidebar-tree";
import { MarkingCenterPanel } from "@/components/owner/marking-center-panel";
import { MathRenderer } from "@/components/math-renderer";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { formatStoredResponse } from "@/lib/response-values";
import { buildMarkingTree, computeMarkingTotals, findMarkingTreeNode, getMarkableLeafNodes, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { cn } from "@/lib/utils";
import type { MarkingTicket, MarkingTicketMessage, QuestionNodeRow, TextResponse, UploadSlot } from "@/types/database";
import { FileText, MessageSquare, Award, ExternalLink, Send } from "lucide-react";

export function StudentResultsWorkspace({ workspace, attemptId }: { workspace: AttemptReviewWorkspace; attemptId: string }) {
  const questionTree = buildMarkingTree(workspace.questionNodes);
  const selectableGroups = getSelectableMarkingGroups(questionTree);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    selectableGroups[0]?.id ?? null
  );

  const selectedNode = findMarkingTreeNode(questionTree, selectedNodeId) ?? selectableGroups[0] ?? null;
  const selectedLeaves = selectedNode ? getMarkableLeafNodes(selectedNode) : [];
  const selectedRootSlot = selectedNode
    ? workspace.uploadSlots.find((item) => item.question_node_id === selectedNode.id)
    : undefined;
  const totals = selectedNode ? computeMarkingTotals(selectedNode, workspace.marks) : null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Released feedback</p>
          <p className="text-sm text-[var(--muted)]">Use the correction notebook to respond to feedback after reviewing each main question.</p>
        </div>
        <ButtonLink href={`/student/attempts/${attemptId}/corrections`}>Open correction notebook</ButtonLink>
      </div>
      <div className="flex min-h-0 flex-1 gap-8 overflow-hidden">
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
                     {selectedNode && selectedRootSlot ? (
                       <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-6">
                         <div className="mb-3 text-xs font-black uppercase tracking-widest text-emerald-700">
                           Full upload for {selectedNode.node_key}
                         </div>
                         <StudentSubmissionBlock
                           attemptId={attemptId}
                           node={selectedNode}
                           slot={selectedRootSlot}
                           annotatedSignedUrl={workspace.annotatedUploadUrls[selectedRootSlot.id]}
                         />
                       </div>
                     ) : null}
                     {selectedLeaves.map((leaf) => {
                       const response = workspace.textResponses.find((item) => item.question_node_id === leaf.id);
                       const shouldShowLeafCard = Boolean(response?.answer_text) || (leaf.id === selectedNode?.id && !selectedRootSlot);
                       if (!shouldShowLeafCard) return null;
                        return (
                          <div key={leaf.id} className="rounded-xl border border-[var(--border)] bg-slate-50/50 p-6">
                            <div className="mb-3 text-xs font-black uppercase tracking-widest text-[var(--subtle)]">{leaf.node_key}</div>
                            <StudentSubmissionBlock
                              attemptId={attemptId}
                              node={leaf}
                              response={response}
                              slot={leaf.id === selectedRootSlot?.question_node_id ? selectedRootSlot : undefined}
                              annotatedSignedUrl={leaf.id === selectedRootSlot?.question_node_id ? workspace.annotatedUploadUrls[selectedRootSlot.id] : undefined}
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

                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
                    <MessageSquare size={14} /> Discussion / appeals
                  </div>
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    Ask about a mark or visible annotation without scrolling below your submission.
                  </p>
                  {selectedLeaves.length ? (
                    <div className="grid gap-4">
                      {selectedLeaves.map((leaf) => (
                        <StudentTicketPanel
                          key={leaf.id}
                          attemptId={workspace.attempt?.id ?? attemptId}
                          node={leaf}
                          tickets={workspace.markingTickets.filter((item) => item.question_node_id === leaf.id)}
                          messages={workspace.markingTicketMessages}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-blue-100 p-4 text-sm italic text-blue-400">
                      Select a marked part to open a discussion.
                    </p>
                  )}
                </section>
              </div>
           </div>
        </section>
      </main>
      </div>
    </div>
  );
}

function StudentSubmissionBlock({
  attemptId,
  node,
  response,
  slot,
  annotatedSignedUrl,
}: {
  attemptId: string;
  node: QuestionNodeRow;
  response?: TextResponse;
  slot?: UploadSlot;
  annotatedSignedUrl?: string;
}) {
  const formatted = response?.answer_text ? formatStoredResponse(response.answer_text, node) : null;
  const [isRequestingOriginal, setIsRequestingOriginal] = useState(false);

  async function requestOriginalCopy() {
    if (!attemptId || !slot?.id) return;
    setIsRequestingOriginal(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "get-student-original-upload-url", {
        body: { attempt_id: attemptId, upload_slot_id: slot.id },
      });
      if (!data?.signed_url) throw new Error("Original copy is not available.");
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not open original copy.");
    } finally {
      setIsRequestingOriginal(false);
    }
  }

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
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Released annotated PDF</p>
              <p className="text-xs leading-5 text-emerald-900/70">
                The visible copy includes released marker annotations. Your original upload is not embedded here.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="bg-white text-emerald-700 hover:bg-emerald-700 hover:text-white"
              onClick={() => (annotatedSignedUrl ? window.open(annotatedSignedUrl, "_blank", "noopener,noreferrer") : undefined)}
              disabled={!annotatedSignedUrl}
            >
              <ExternalLink size={14} /> Open annotated
            </Button>
          </div>
          {annotatedSignedUrl ? (
            <iframe title={`Annotated answer for ${node.node_key}`} src={annotatedSignedUrl} className="h-[520px] w-full rounded-lg border border-emerald-100 bg-white" />
          ) : (
            <div className="rounded-lg border border-dashed border-emerald-100 bg-white/70 p-5 text-sm italic text-emerald-800">
              A visibly annotated copy has not been released for this upload yet.
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs leading-5 text-slate-600">
              Original copy is available on request for checking your submitted file.
            </p>
            <Button type="button" variant="secondary" className="bg-white text-slate-700" onClick={() => void requestOriginalCopy()} disabled={isRequestingOriginal}>
              <ExternalLink size={14} /> {isRequestingOriginal ? "Requesting..." : "Request original"}
            </Button>
          </div>
        </div>
      ) : null}

      {!formatted && !slot?.object_path ? (
        <p className="text-sm italic text-[var(--muted)]">No digital response recorded for this part.</p>
      ) : null}
    </div>
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
