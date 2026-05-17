"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, FileText, AlertCircle, Flag, Ban, CheckCircle2, History, User, Lock, ExternalLink, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { formatStoredResponse } from "@/lib/response-values";
import { WorkAnnotationStudio } from "@/components/owner/work-annotation-studio";
import {
  binaryMarkDecisionFromAwarded,
  markForBinaryDecision,
  responseModeUsesBinaryMarking,
  type BinaryMarkDecision,
} from "@/lib/marking-scoring";
import type { MarkingTreeNode } from "@/lib/marking-tree";
import { cn } from "@/lib/utils";
import type { MarkingTicket, MarkingTicketMessage, QuestionNodeRow, TextResponse, UploadSlot, Mark, SubmissionAnnotation, WorkAnnotation } from "@/types/database";

export function MarkingResponseWorkspace({
  attemptId,
  rootNode,
  rootSlot,
  nodes,
  responses,
  marks,
  annotations,
  workAnnotations = [],
  markingTickets = [],
  markingTicketMessages = [],
  showDiscussion = true,
  studentName = "Student",
  assessmentTitle = "Assessment",
  paperCode = null,
  releaseStatus = "Draft",
  node,
  response,
  slot,
  mark,
}: {
  attemptId: string;
  rootNode?: MarkingTreeNode;
  rootSlot?: UploadSlot;
  nodes?: MarkingTreeNode[];
  responses?: TextResponse[];
  marks?: Mark[];
  annotations: SubmissionAnnotation[];
  workAnnotations?: WorkAnnotation[];
  markingTickets?: MarkingTicket[];
  markingTicketMessages?: MarkingTicketMessage[];
  showDiscussion?: boolean;
  studentName?: string;
  assessmentTitle?: string;
  paperCode?: string | null;
  releaseStatus?: string;
  node?: QuestionNodeRow;
  response?: TextResponse;
  slot?: UploadSlot;
  mark?: Mark;
}) {
  const showRootUploadCard = Boolean(rootNode && rootSlot && !nodes?.some((leaf) => leaf.id === rootNode.id));
  const cards = nodes?.length
    ? nodes.map((leaf) => ({
        node: leaf,
        response: responses?.find((item) => item.question_node_id === leaf.id),
        slot: leaf.id === rootSlot?.question_node_id ? rootSlot : undefined,
        mark: marks?.find((item) => item.question_node_id === leaf.id),
        annotations: annotations.filter((item) => item.question_node_id === leaf.id),
        workAnnotations: workAnnotations.filter((item) => item.question_node_id === leaf.id),
        markingTickets: markingTickets.filter((item) => item.question_node_id === leaf.id),
      }))
    : node
      ? [{ node, response, slot, mark, annotations, workAnnotations, markingTickets }]
      : [];

  if (!cards.length && !showRootUploadCard) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted)]">
        <Ban size={24} className="mb-3 opacity-50" />
        <p className="text-sm font-bold uppercase tracking-widest">No markable parts</p>
        <p className="mt-1 text-xs">This question is currently structural only.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {showRootUploadCard && rootNode && rootSlot ? (
        <RootQuestionUploadCard
          attemptId={attemptId}
          node={rootNode}
          slot={rootSlot}
          annotations={workAnnotations.filter((item) => item.question_node_id === rootNode.id)}
          studentName={studentName}
          assessmentTitle={assessmentTitle}
          paperCode={paperCode}
          releaseStatus={releaseStatus}
        />
      ) : null}
      {cards.map((card) => (
        <MarkingResponseCard
          key={card.node.id}
          attemptId={attemptId}
          node={card.node}
          response={card.response}
          slot={card.slot}
          mark={card.mark}
          annotations={card.annotations}
          workAnnotations={card.workAnnotations}
          markingTickets={card.markingTickets}
          markingTicketMessages={markingTicketMessages}
          showDiscussion={showDiscussion}
          studentName={studentName}
          assessmentTitle={assessmentTitle}
          paperCode={paperCode}
          releaseStatus={releaseStatus}
        />
      ))}
    </div>
  );
}

function RootQuestionUploadCard({
  attemptId,
  node,
  slot,
  annotations,
  studentName,
  assessmentTitle,
  paperCode,
  releaseStatus,
}: {
  attemptId: string;
  node: QuestionNodeRow;
  slot: UploadSlot;
  annotations: WorkAnnotation[];
  studentName: string;
  assessmentTitle: string;
  paperCode: string | null;
  releaseStatus: string;
}) {
  async function downloadFile(path: string) {
    const supabase = createSupabaseBrowserClient();
    try {
      const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
        body: { bucket: "answer-uploads", object_path: path, purpose: "answer_upload", expires_in_seconds: 300 },
        requiresAal2: true,
      });
      if (!data?.signed_url) throw new Error("Could not generate download link");
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert("Could not generate download link: " + (error instanceof Error ? error.message : "Unknown error") + "\nPath: " + path);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50/20 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-white px-5 py-3">
        <div>
          <h3 className="text-sm font-black text-[var(--ink)]">Student upload for {node.node_key}</h3>
          <p className="text-xs leading-5 text-[var(--muted)]">
            One PDF covers the full main question and all nested subparts.
          </p>
        </div>
        <Badge tone={slot.status === "uploaded" ? "success" : "neutral"}>
          {slot.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className="grid gap-6 p-6">
        {slot.object_path ? (
          <SubmissionPdfPreview objectPath={slot.object_path} onDownload={() => downloadFile(slot.object_path!)} />
        ) : (
          <div className="rounded-xl border border-dashed border-blue-100 bg-white p-8 text-center text-sm italic text-blue-500">
            No root-question PDF has been uploaded for {node.node_key}.
          </div>
        )}
        <WorkAnnotationPanel
          attemptId={attemptId}
          node={node}
          slot={slot}
          annotations={annotations}
          studentName={studentName}
          assessmentTitle={assessmentTitle}
          paperCode={paperCode}
          releaseStatus={releaseStatus}
        />
      </div>
    </section>
  );
}

export function MarkingDiscussionWorkspace({
  attemptId,
  nodes,
  markingTickets = [],
  markingTicketMessages = [],
}: {
  attemptId: string;
  nodes: MarkingTreeNode[];
  markingTickets?: MarkingTicket[];
  markingTicketMessages?: MarkingTicketMessage[];
}) {
  if (!nodes.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--muted)]">
        <MessageSquare size={24} className="mb-3 opacity-50" />
        <p className="text-sm font-bold uppercase tracking-widest">No discussion target</p>
        <p className="mt-1 text-xs">Select a question with markable parts to open or review discussion tickets.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {nodes.map((node) => (
        <div key={node.id} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-[var(--ink)]">{node.node_key}</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">
                {node.title || node.response_mode.replaceAll("_", " ")}
              </p>
            </div>
            <Badge tone="accent">
              {markingTickets.filter((ticket) => ticket.question_node_id === node.id).length} tickets
            </Badge>
          </div>
          <OwnerTicketPanel
            attemptId={attemptId}
            node={node}
            tickets={markingTickets.filter((ticket) => ticket.question_node_id === node.id)}
            messages={markingTicketMessages}
          />
        </div>
      ))}
    </div>
  );
}

function MarkingResponseCard({
  attemptId,
  node,
  response,
  slot,
  mark,
  annotations,
  workAnnotations,
  markingTickets,
  markingTicketMessages,
  showDiscussion,
  studentName,
  assessmentTitle,
  paperCode,
  releaseStatus,
}: {
  attemptId: string;
  node: QuestionNodeRow;
  response?: TextResponse;
  slot?: UploadSlot;
  mark?: Mark;
  annotations: SubmissionAnnotation[];
  workAnnotations: WorkAnnotation[];
  markingTickets: MarkingTicket[];
  markingTicketMessages: MarkingTicketMessage[];
  showDiscussion: boolean;
  studentName: string;
  assessmentTitle: string;
  paperCode: string | null;
  releaseStatus: string;
}) {
  const router = useRouter();
  const [awarded, setAwarded] = useState(mark ? String(mark.awarded_marks) : "");
  const [binaryDecision, setBinaryDecision] = useState<BinaryMarkDecision>(
    binaryMarkDecisionFromAwarded(mark?.awarded_marks, node?.marks ?? 0),
  );
  const [notes, setNotes] = useState(mark?.notes ?? "");
  const existingFeedback = annotations.find(a => a.annotation_type === "feedback");
  const [studentFeedback, setStudentFeedback] = useState(existingFeedback?.body ?? "");
  const [isFlagged, setIsFlagged] = useState(annotations.some(a => a.annotation_type === "marker_flag"));
  const [isUnreadable, setIsUnreadable] = useState(annotations.some(a => a.is_unreadable));
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Sync state when props change (e.g. after router.refresh)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setAwarded(mark ? String(mark.awarded_marks) : "");
      setBinaryDecision(binaryMarkDecisionFromAwarded(mark?.awarded_marks, node?.marks ?? 0));
      setNotes(mark?.notes ?? "");
      setStudentFeedback(existingFeedback?.body ?? "");
      setIsFlagged(annotations.some(a => a.annotation_type === "marker_flag"));
      setIsUnreadable(annotations.some(a => a.is_unreadable));
    }, 0);
    return () => window.clearTimeout(id);
  }, [mark, node, existingFeedback, annotations]);

  async function handleSave() {
    const usesBinaryMarking = responseModeUsesBinaryMarking(node.response_mode);
    const binaryAwarded = markForBinaryDecision(binaryDecision, node.marks ?? 0);
    if (usesBinaryMarking && binaryAwarded === null) {
      alert("Choose Correct or Incorrect before saving this structured response.");
      return;
    }
    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();
    try {
      const annotationsToSave = [];
      if (isFlagged) {
        annotationsToSave.push({
          question_node_id: node.id,
          annotation_type: "marker_flag" as const,
          body: "Flagged for review",
          is_unreadable: false,
        });
      }
      if (isUnreadable) {
        annotationsToSave.push({
          question_node_id: node.id,
          annotation_type: "note" as const,
          body: "Marked as unreadable",
          is_unreadable: true,
        });
      }
      if (notes.trim()) {
        annotationsToSave.push({
          question_node_id: node.id,
          annotation_type: "note" as const,
          body: notes.trim(),
          is_unreadable: false,
        });
      }
      if (studentFeedback.trim()) {
        annotationsToSave.push({
          question_node_id: node.id,
          annotation_type: "feedback" as const,
          body: studentFeedback.trim(),
          is_unreadable: false,
        });
      }

      await invokeEdgeFunction(supabase, "save-marking", {
        body: {
          attempt_id: attemptId,
          marks: [{
            question_node_id: node.id,
            awarded_marks: usesBinaryMarking ? binaryAwarded ?? 0 : Number(awarded) || 0,
            notes: notes,
          }],
          annotations: annotationsToSave,
        },
        requiresAal2: true,
      });
      setLastSaved(new Date());
      router.refresh();
    } catch (error) {
      console.error("Save failed", error);
      alert("Failed to save: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadFile(path: string) {
    const supabase = createSupabaseBrowserClient();
    try {
      const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
        body: { bucket: "answer-uploads", object_path: path, purpose: "answer_upload", expires_in_seconds: 300 },
        requiresAal2: true,
      });
      if (!data?.signed_url) throw new Error("Could not generate download link");
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert("Could not generate download link: " + (error instanceof Error ? error.message : "Unknown error") + "\nPath: " + path);
    }
  }

  const maxMarks = node.marks ?? 0;
  const usesBinaryMarking = responseModeUsesBinaryMarking(node.response_mode);
  const binaryAwarded = markForBinaryDecision(binaryDecision, maxMarks);
  const visibleAwarded = usesBinaryMarking ? binaryAwarded ?? 0 : Number(awarded) || 0;
  const isOverLimit = !usesBinaryMarking && (Number(awarded) || 0) > maxMarks;

  return (
    <div id={`mark-response-${node.id}`} className="scroll-mt-24 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-slate-50/70 px-5 py-3">
        <div>
          <h3 className="text-sm font-black text-[var(--ink)]">{node.node_key}</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">
            {node.title || node.response_mode.replaceAll("_", " ")}
          </p>
        </div>
        <Badge tone={usesBinaryMarking ? "accent" : "neutral"} className="font-bold">
          {usesBinaryMarking ? "Correct / Incorrect" : `${maxMarks} marks`}
        </Badge>
      </div>
      <div className="flex min-h-[520px] gap-8 overflow-hidden p-6">
      {/* Left Column: Response Viewer Area */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--subtle)]">Student Submission</h3>
          {slot?.uploaded_at && (
            <Badge tone="neutral" className="text-[9px] bg-transparent border-none opacity-50">
              {new Date(slot.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Badge>
          )}
        </div>

        {response?.answer_text ? (
          <div className="rounded-xl border border-[var(--border)] bg-slate-50/50 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400">
              <FileText size={12} /> Student work - typed response
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--ink)] selection:bg-blue-100">
              {formatStoredResponse(response.answer_text, node)}
            </p>
          </div>
        ) : slot?.object_path ? (
          <SubmissionPdfPreview objectPath={slot.object_path} onDownload={() => downloadFile(slot.object_path!)} />
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-12 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-[var(--surface-muted)] flex items-center justify-center mb-4 opacity-50">
              <Ban size={20} className="text-[var(--subtle)]" />
            </div>
            <p className="text-sm font-bold text-[var(--subtle)] uppercase tracking-tight">No Response Found</p>
            <p className="text-xs text-[var(--muted)] mt-1">Student has not submitted any content for this question.</p>
          </div>
        )}

        {isUnreadable && (
          <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4 flex items-start gap-3 text-orange-800 shadow-sm animate-in zoom-in-95 duration-200">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-black uppercase tracking-tight">Status: Unreadable</p>
              <p className="text-xs opacity-80 leading-relaxed">The file is corrupt or the handwriting is not legible. Marks may be affected.</p>
            </div>
          </div>
        )}

        <WorkAnnotationPanel
          attemptId={attemptId}
          node={node}
          response={response}
          slot={slot}
          annotations={workAnnotations}
          studentName={studentName}
          assessmentTitle={assessmentTitle}
          paperCode={paperCode}
          releaseStatus={releaseStatus}
        />
      </div>

      {/* Right Column: Marking Controls */}
      <div className="w-[400px] flex-shrink-0 flex flex-col h-full pl-6 border-l border-[var(--border)] overflow-y-auto space-y-6">
        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--subtle)]">
                Assessment Outcome
              </label>
              <div className="flex items-center gap-2">
                <Badge tone={isOverLimit ? "danger" : "accent"} className="h-5 px-1.5 font-bold tabular-nums">
                  {visibleAwarded} / {maxMarks}
                </Badge>
              </div>
            </div>
            
            {usesBinaryMarking ? (
              <div className="grid gap-2">
                <p className="text-xs font-semibold text-[var(--muted)]">
                  Structured responses are marked as correct or incorrect. Correct awards full marks; incorrect awards 0.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={binaryDecision === "correct" ? "primary" : "secondary"}
                    className={cn("h-14 font-black", binaryDecision === "correct" && "text-white")}
                    onClick={() => setBinaryDecision("correct")}
                  >
                    Correct - award full marks
                  </Button>
                  <Button
                    type="button"
                    variant={binaryDecision === "incorrect" ? "primary" : "secondary"}
                    className={cn("h-14 font-black", binaryDecision === "incorrect" && "text-white")}
                    onClick={() => setBinaryDecision("incorrect")}
                  >
                    Incorrect - award 0 marks
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className={cn("h-10 text-[10px] font-bold uppercase tracking-tighter transition-all", isFlagged && "bg-red-600 border-red-600 text-white hover:bg-red-700")}
                    onClick={() => setIsFlagged(!isFlagged)}
                  >
                    <Flag size={12} className={cn("mr-1.5", isFlagged && "fill-current")} />
                    {isFlagged ? "Review Required" : "Flag"}
                  </Button>
                  <Button
                    variant="secondary"
                    className={cn("h-10 text-[10px] font-bold uppercase tracking-tighter transition-all", isUnreadable && "bg-orange-600 border-orange-600 text-white hover:bg-orange-700")}
                    onClick={() => setIsUnreadable(!isUnreadable)}
                  >
                    <Ban size={12} className="mr-1.5" />
                    {isUnreadable ? "Broken/Corrupt" : "Corrupt"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-3 relative group">
                  <Input
                    type="number"
                    step={0.5}
                    min={0}
                    max={maxMarks}
                    value={awarded}
                    onChange={(e) => setAwarded(e.target.value)}
                    className={cn(
                      "text-3xl font-black h-16 pl-6 transition-all",
                      isOverLimit ? "border-red-500 bg-red-50 text-red-700" : "bg-slate-50 border-transparent hover:bg-slate-100 focus:bg-white focus:border-[var(--primary)]"
                    )}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-black text-lg pointer-events-none group-focus-within:text-[var(--primary)]">
                    PTS
                  </div>
                </div>

                <div className="col-span-2 grid grid-rows-2 gap-2">
                  <Button
                    variant="secondary"
                    className={cn("h-full text-[10px] font-bold uppercase tracking-tighter transition-all", isFlagged && "bg-red-600 border-red-600 text-white hover:bg-red-700")}
                    onClick={() => setIsFlagged(!isFlagged)}
                  >
                    <Flag size={12} className={cn("mr-1.5", isFlagged && "fill-current")} />
                    {isFlagged ? "Review Required" : "Flag"}
                  </Button>
                  <Button
                    variant="secondary"
                    className={cn("h-full text-[10px] font-bold uppercase tracking-tighter transition-all", isUnreadable && "bg-orange-600 border-orange-600 text-white hover:bg-orange-700")}
                    onClick={() => setIsUnreadable(!isUnreadable)}
                  >
                    <Ban size={12} className="mr-1.5" />
                    {isUnreadable ? "Broken/Corrupt" : "Corrupt"}
                  </Button>
                </div>
              </div>
            )}
            {isOverLimit && (
              <p className="text-[10px] font-bold text-red-600 flex items-center gap-1.5 px-1">
                <AlertCircle size={12} /> SCORE CANNOT EXCEED {maxMarks} FOR THIS NODE
              </p>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600">
                <User size={12} /> Student Feedback
              </label>
              <Textarea
                placeholder="Detailed explanation for the student..."
                className="text-sm min-h-[100px] border-blue-100 focus:border-blue-400 focus:ring-blue-400/20 bg-blue-50/10"
                value={studentFeedback}
                onChange={(e) => setStudentFeedback(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <Lock size={12} /> Internal Annotation
              </label>
              <Textarea
                placeholder="Private notes for moderation team..."
                className="text-sm min-h-[60px] bg-slate-50 border-slate-200 focus:border-slate-400"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            {lastSaved ? (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-green-50 text-[10px] font-bold text-green-700 border border-green-100">
                <CheckCircle2 size={12} />
                Sync Complete • {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                <History size={12} className="animate-pulse" />
                Unsaved modifications
              </div>
            )}
          </div>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || isOverLimit || (usesBinaryMarking && binaryDecision === "unmarked")}
            className="px-8 font-black uppercase tracking-widest shadow-lg shadow-blue-500/20"
          >
            {isSaving ? (
              <div className="h-4 w-4 animate-spin border-2 border-white/30 border-t-white rounded-full mr-2" />
            ) : (
              <Save size={16} className="mr-2" />
            )}
            {isSaving ? "Syncing..." : "Finalize Change"}
          </Button>
        </div>

        {showDiscussion ? (
          <OwnerTicketPanel
            attemptId={attemptId}
            node={node}
            tickets={markingTickets}
            messages={markingTicketMessages}
          />
        ) : null}
      </div>
      </div>
    </div>
  );
}

function SubmissionPdfPreview({ objectPath, onDownload }: { objectPath: string; onDownload: () => void }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function signPdf() {
      try {
        const supabase = createSupabaseBrowserClient();
        const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
          body: { bucket: "answer-uploads", object_path: objectPath, purpose: "answer_upload", expires_in_seconds: 300 },
          requiresAal2: true,
        });
        if (!data?.signed_url) throw new Error("Could not generate PDF preview link");
        if (!cancelled) setSignedUrl(data.signed_url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not preview PDF");
      }
    }
    signPdf();
    return () => {
      cancelled = true;
    };
  }, [objectPath]);

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Student work - uploaded PDF</p>
          <p className="text-xs text-blue-700/70">Original submission stays unchanged. Marker annotations are stored as a separate review layer.</p>
        </div>
        <Button variant="secondary" onClick={onDownload} className="bg-white text-blue-700 hover:bg-blue-600 hover:text-white">
          <ExternalLink size={14} className="mr-2" /> Open
        </Button>
      </div>
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{error}</div>
      ) : signedUrl ? (
        <iframe
          title="Student uploaded PDF"
          src={signedUrl}
          data-hide-during-annotation-studio="true"
          className="h-[560px] w-full rounded-lg border border-slate-200 bg-white"
        />
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-blue-100 text-sm text-blue-500">
          Loading PDF preview...
        </div>
      )}
    </div>
  );
}

function WorkAnnotationPanel({
  attemptId,
  node,
  response,
  slot,
  annotations,
  studentName,
  assessmentTitle,
  paperCode,
  releaseStatus,
}: {
  attemptId: string;
  node: QuestionNodeRow;
  response?: TextResponse;
  slot?: UploadSlot;
  annotations: WorkAnnotation[];
  studentName: string;
  assessmentTitle: string;
  paperCode: string | null;
  releaseStatus: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"student_visible" | "private">("student_visible");
  const [severity, setSeverity] = useState<"note" | "minor" | "major" | "critical">("note");
  const [selectedText, setSelectedText] = useState("");
  const [page, setPage] = useState("1");
  const [location, setLocation] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const annotationKind = slot?.object_path ? "uploaded_pdf" : response?.answer_text ? "typed_text" : "general";

  function captureSelectedText() {
    const selection = window.getSelection()?.toString().trim();
    if (selection) setSelectedText(selection.slice(0, 500));
  }

  async function saveAnnotation() {
    if (!body.trim()) return;
    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "save-work-annotation", {
        body: {
          attempt_id: attemptId,
          question_node_id: node.id,
          upload_slot_id: slot?.id ?? null,
          text_response_id: response?.id ?? null,
          annotation_kind: annotationKind,
          visibility,
          severity,
          body,
          anchor_json: annotationKind === "uploaded_pdf"
            ? { page: Number(page) || 1, location_label: location || null }
            : { selected_text: selectedText || null },
        },
        requiresAal2: true,
      });
      setBody("");
      setSelectedText("");
      setLocation("");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save annotation.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAnnotation(annotationId: string) {
    if (!confirm("Delete this marker annotation?")) return;
    const supabase = createSupabaseBrowserClient();
    await invokeEdgeFunction(supabase, "save-work-annotation", {
      body: { attempt_id: attemptId, question_node_id: node.id, annotation_id: annotationId, annotation_kind: annotationKind, delete: true },
      requiresAal2: true,
    });
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Marker annotations</h4>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              These are your comments on the student&apos;s work. Use the full-screen studio for shapes, text boxes, sketching, and page-level PDF annotations.
            </p>
          </div>
          <WorkAnnotationStudio
            attemptId={attemptId}
            node={node}
            response={response}
            slot={slot}
            annotations={annotations}
            studentName={studentName}
            assessmentTitle={assessmentTitle}
            paperCode={paperCode}
            releaseStatus={releaseStatus}
          />
        </div>
      </div>
      {annotations.length ? (
        <div className="mb-4 grid gap-2">
          {annotations.map((annotation) => (
            <div key={annotation.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {annotation.visibility === "student_visible" ? "Student visible" : "Private"} · {annotation.severity}
                </span>
                <Button variant="ghost" className="h-7 px-2 text-red-600" onClick={() => void deleteAnnotation(annotation.id)}>
                  <Trash2 size={13} />
                </Button>
              </div>
              {renderAnchor(annotation.anchor_json)}
              <p className="text-sm leading-6 text-[var(--ink)]">{annotation.body}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3">
        {annotationKind === "typed_text" ? (
          <div className="grid gap-2">
            <Button type="button" variant="secondary" className="justify-self-start text-xs" onClick={captureSelectedText}>
              Use selected student text as anchor
            </Button>
            <Input value={selectedText} onChange={(event) => setSelectedText(event.target.value)} placeholder="Quoted student text or line reference" />
          </div>
        ) : annotationKind === "uploaded_pdf" ? (
          <div className="grid gap-2 md:grid-cols-[120px_1fr]">
            <Input type="number" min={1} value={page} onChange={(event) => setPage(event.target.value)} aria-label="PDF page number" />
            <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location on page, e.g. top-left, line 4, diagram label" />
          </div>
        ) : null}
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Explain the exact marking issue or correction." />
        <div className="grid gap-2 md:grid-cols-3">
          <select className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm" value={visibility} onChange={(event) => setVisibility(event.target.value as "student_visible" | "private")}>
            <option value="student_visible">Student visible</option>
            <option value="private">Private</option>
          </select>
          <select className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm" value={severity} onChange={(event) => setSeverity(event.target.value as "note" | "minor" | "major" | "critical")}>
            <option value="note">Note</option>
            <option value="minor">Minor issue</option>
            <option value="major">Major issue</option>
            <option value="critical">Critical issue</option>
          </select>
          <Button type="button" onClick={() => void saveAnnotation()} disabled={isSaving || !body.trim()} className="text-white">
            Save annotation
          </Button>
        </div>
      </div>
    </section>
  );
}

function OwnerTicketPanel({
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
  const [replyByTicket, setReplyByTicket] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  async function createTicket() {
    if (!subject.trim() || !message.trim()) return;
    const supabase = createSupabaseBrowserClient();
    await invokeEdgeFunction(supabase, "marking-ticket", {
      body: {
        action: "create",
        attempt_id: attemptId,
        question_node_id: node.id,
        subject: subject.trim(),
        message: message.trim(),
      },
      requiresAal2: true,
    });
    setSubject("");
    setMessage("");
    router.refresh();
  }

  async function reply(ticketId: string) {
    const message = replyByTicket[ticketId]?.trim();
    if (!message) return;
    const supabase = createSupabaseBrowserClient();
    await invokeEdgeFunction(supabase, "marking-ticket", {
      body: { action: "reply", ticket_id: ticketId, message },
      requiresAal2: true,
    });
    setReplyByTicket((prev) => ({ ...prev, [ticketId]: "" }));
    router.refresh();
  }

  async function updateStatus(ticketId: string, status: MarkingTicket["status"]) {
    const supabase = createSupabaseBrowserClient();
    await invokeEdgeFunction(supabase, "marking-ticket", {
      body: { action: "update_status", ticket_id: ticketId, status },
      requiresAal2: true,
    });
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/30 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
        <MessageSquare size={13} /> Mark discussion tickets
      </h4>
      <div className="mb-4 grid gap-2 rounded-lg border border-blue-100 bg-white p-3">
        <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={`Open a discussion about ${node.node_key}`} />
        <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Visible to the student after feedback release. Use this for clarifications or disputed marking points." />
        <Button type="button" className="justify-self-start text-white" disabled={!subject.trim() || !message.trim()} onClick={() => void createTicket()}>
          Open discussion
        </Button>
      </div>
      {tickets.length ? (
      <div className="grid gap-3">
        {tickets.map((ticket) => {
          const ticketMessages = messages.filter((message) => message.ticket_id === ticket.id);
          return (
            <div key={ticket.id} className="rounded-lg border border-blue-100 bg-white p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-[var(--ink)]">{ticket.subject}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">{ticket.status.replaceAll("_", " ")}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="secondary" className="h-7 px-2 text-[10px]" onClick={() => void updateStatus(ticket.id, "resolved")}>Resolve</Button>
                  <Button variant="secondary" className="h-7 px-2 text-[10px]" onClick={() => void updateStatus(ticket.id, "closed")}>Close</Button>
                </div>
              </div>
              <div className="mb-3 grid gap-2">
                {ticketMessages.map((message) => (
                  <div key={message.id} className={cn("rounded-md p-2 text-xs leading-5", message.author_role === "owner" ? "bg-blue-50 text-blue-950" : "bg-slate-100 text-slate-800")}>
                    <span className="font-black uppercase tracking-widest">{message.author_role === "owner" ? "Marker" : "Student"}: </span>
                    {message.body}
                  </div>
                ))}
              </div>
              <Textarea
                value={replyByTicket[ticket.id] ?? ""}
                onChange={(event) => setReplyByTicket((prev) => ({ ...prev, [ticket.id]: event.target.value }))}
                placeholder="Reply to the student..."
              />
              <Button className="mt-2 text-white" type="button" onClick={() => void reply(ticket.id)} disabled={!replyByTicket[ticket.id]?.trim()}>
                Reply
              </Button>
            </div>
          );
        })}
      </div>
      ) : (
        <p className="rounded-lg border border-dashed border-blue-100 bg-white/60 p-4 text-xs italic text-blue-500">
          No discussion tickets for this part yet.
        </p>
      )}
    </section>
  );
}

function renderAnchor(anchor: unknown) {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return null;
  const value = anchor as { selected_text?: unknown; page?: unknown; location_label?: unknown; annotation_tool?: unknown; x?: unknown; y?: unknown };
  if (typeof value.selected_text === "string" && value.selected_text.trim()) {
    return <blockquote className="mb-2 border-l-2 border-blue-300 pl-3 text-xs italic text-slate-600">{value.selected_text}</blockquote>;
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
