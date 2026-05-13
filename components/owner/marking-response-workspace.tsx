"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, FileText, Paperclip, AlertCircle, Flag, Ban, CheckCircle2, History, User, Lock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { formatStoredResponse } from "@/lib/response-values";
import {
  binaryMarkDecisionFromAwarded,
  markForBinaryDecision,
  responseModeUsesBinaryMarking,
  type BinaryMarkDecision,
} from "@/lib/marking-scoring";
import { cn } from "@/lib/utils";
import type { QuestionNodeRow, TextResponse, UploadSlot, Mark, SubmissionAnnotation } from "@/types/database";

export function MarkingResponseWorkspace({
  attemptId,
  node,
  response,
  slot,
  mark,
  annotations,
}: {
  attemptId: string;
  node?: QuestionNodeRow;
  response?: TextResponse;
  slot?: UploadSlot;
  mark?: Mark;
  annotations: SubmissionAnnotation[];
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

  if (!node) return null;

  async function handleSave() {
    if (!node) return;
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
    <div className="flex h-full gap-8 overflow-hidden">
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
              <FileText size={12} /> Digital Response
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--ink)] selection:bg-blue-100">
              {formatStoredResponse(response.answer_text, node)}
            </p>
          </div>
        ) : slot?.object_path ? (
          <div className="rounded-xl border-2 border-dashed border-blue-100 p-8 flex flex-col items-center justify-center bg-blue-50/10 transition-colors hover:bg-blue-50/20 group">
            <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
              <Paperclip size={24} className="text-blue-500" />
            </div>
            <div className="text-center mb-6">
              <p className="text-sm font-bold text-blue-900">Attachment Uploaded</p>
              <p className="text-xs text-blue-600/70">Scanned PDF or mobile capture</p>
            </div>
            <Button 
              variant="secondary" 
              onClick={() => downloadFile(slot.object_path!)}
              className="bg-white border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 shadow-sm"
            >
              <ExternalLink size={14} className="mr-2" /> View Submission PDF
            </Button>
          </div>
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
      </div>
    </div>
  );
}
