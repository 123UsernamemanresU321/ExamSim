"use client";

import { useState, useEffect } from "react";
import { Download, Save, FileText, Paperclip, AlertCircle, Flag, Ban, CheckCircle2, MessageSquare, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MarkingResponseWorkspace({
  attemptId,
  node,
  response,
  slot,
  mark,
  annotations,
  commentBank,
}: {
  attemptId: string;
  node?: any;
  response?: any;
  slot?: any;
  mark?: any;
  annotations: any[];
  commentBank: any[];
}) {
  const [awarded, setAwarded] = useState(mark ? String(mark.awarded_marks) : "");
  const [notes, setNotes] = useState(mark?.notes ?? "");
  const [studentFeedback, setStudentFeedback] = useState("");
  const [isFlagged, setIsFlagged] = useState(annotations.some(a => a.annotation_type === "marker_flag"));
  const [isUnreadable, setIsUnreadable] = useState(annotations.some(a => a.is_unreadable));
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Reset local state when node changes
  useEffect(() => {
    setAwarded(mark ? String(mark.awarded_marks) : "");
    setNotes(mark?.notes ?? "");
    setIsFlagged(annotations.some(a => a.annotation_type === "marker_flag"));
    setIsUnreadable(annotations.some(a => a.is_unreadable));
  }, [node?.id, mark, annotations]);

  if (!node) return null;

  async function handleSave() {
    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "save-marking", {
        body: {
          attempt_id: attemptId,
          marks: [{
            question_node_id: node.id,
            awarded_marks: Number(awarded) || 0,
            notes: notes,
          }],
          annotations: [
            {
              question_node_id: node.id,
              annotation_type: isFlagged ? "marker_flag" : "note",
              is_unreadable: isUnreadable,
              body: isFlagged ? "Flagged for review" : "",
            }
          ],
        },
        requiresAal2: true,
      });
      setLastSaved(new Date());
    } catch (error) {
      console.error("Save failed", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadFile(path: string) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage.from("answer-uploads").createSignedUrl(path, 60);
    if (error) return alert("Error: " + error.message);
    window.open(data.signedUrl, "_blank");
  }

  const maxMarks = node.marks ?? 0;
  const isOverLimit = (Number(awarded) || 0) > maxMarks;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Response Viewer Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--subtle)]">Student Response</h3>
          {slot?.uploaded_at && (
            <span className="text-[10px] text-[var(--muted)]">
              Uploaded: {new Date(slot.uploaded_at).toLocaleString()}
            </span>
          )}
        </div>

        {response?.answer_text ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-inner">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--subtle)]">
              <FileText size={12} /> Typed Answer
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{response.answer_text}</p>
          </div>
        ) : slot?.object_path ? (
          <div className="rounded-lg border border-[var(--border)] p-4 flex flex-col items-center justify-center bg-white shadow-sm gap-4">
            <Paperclip size={32} className="text-blue-500 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium">PDF Attachment</p>
              <p className="text-xs text-[var(--muted)]">Uploaded via mobile or scan</p>
            </div>
            <Button variant="secondary" onClick={() => downloadFile(slot.object_path!)}>
              <Download size={14} className="mr-2" /> Open PDF in new tab
            </Button>
          </div>
        ) : slot?.status === "blank_placeholder" ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-8 flex flex-col items-center justify-center text-[var(--muted)]">
            <Ghost size={32} className="mb-2 opacity-20" />
            <p className="text-xs font-medium uppercase">Student marked as blank</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-8 flex flex-col items-center justify-center text-[var(--muted)]">
            <Ban size={32} className="mb-2 opacity-20" />
            <p className="text-xs font-medium uppercase text-red-500/50">Missing response</p>
          </div>
        )}

        {isUnreadable && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-center gap-3 text-red-700">
            <AlertCircle size={18} />
            <p className="text-xs font-medium">Marked as unreadable/broken file.</p>
          </div>
        )}
      </div>

      {/* Marking Controls */}
      <div className="pt-4 border-t border-[var(--border)] space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)] mb-1.5 block">
              Awarded Marks
            </label>
            <div className="relative">
              <Input
                type="number"
                step={0.5}
                min={0}
                max={maxMarks}
                value={awarded}
                onChange={(e) => setAwarded(e.target.value)}
                className={cn(
                  "text-xl font-bold h-12",
                  isOverLimit && "border-red-500 bg-red-50 text-red-700 focus-visible:ring-red-500"
                )}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] font-medium">
                / {maxMarks}
              </span>
            </div>
            {isOverLimit && (
              <p className="mt-1 text-[10px] font-medium text-red-600 flex items-center gap-1">
                <AlertCircle size={10} /> Cannot exceed max marks
              </p>
            )}
          </div>

          <div className="flex flex-col justify-end gap-2">
            <Button
              variant="secondary"
              className={cn("h-10 justify-start px-3", isFlagged && "bg-red-50 border-red-200 text-red-700")}
              onClick={() => setIsFlagged(!isFlagged)}
            >
              <Flag size={14} className={cn("mr-2", isFlagged && "fill-red-700")} />
              {isFlagged ? "Flagged" : "Flag for review"}
            </Button>
            <Button
              variant="secondary"
              className={cn("h-10 justify-start px-3", isUnreadable && "bg-orange-50 border-orange-200 text-orange-700")}
              onClick={() => setIsUnreadable(!isUnreadable)}
            >
              <Ban size={14} className="mr-2" />
              {isUnreadable ? "Unreadable" : "Mark unreadable"}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)] mb-1.5">
              <MessageSquare size={12} /> Student Feedback
            </label>
            <Textarea
              placeholder="Explain why marks were awarded/deducted..."
              className="text-sm min-h-[80px]"
              value={studentFeedback}
              onChange={(e) => setStudentFeedback(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)] mb-1.5 block">
              Marker Notes (Private)
            </label>
            <Textarea
              placeholder="Internal notes for moderation..."
              className="text-sm min-h-[60px] bg-slate-50"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
            {lastSaved ? (
              <>
                <CheckCircle2 size={12} className="text-green-500" />
                Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </>
            ) : (
              <>
                <History size={12} />
                Unsaved changes
              </>
            )}
          </div>
          <Button onClick={handleSave} disabled={isSaving || isOverLimit} className="gap-2">
            <Save size={14} />
            {isSaving ? "Saving..." : "Save Progress"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Ghost({ size, className }: { size: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </svg>
  );
}
