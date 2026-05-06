"use client";

import { useState } from "react";
import { Download, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { calculateAwardedMarks } from "@/lib/marking";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Mark, QuestionNodeRow, TextResponse, UploadSlot } from "@/types/database";

export function MarkingWorkspaceForm({
  attemptId,
  questionNodes,
  textResponses,
  uploadSlots,
  marks,
}: {
  attemptId: string;
  questionNodes: QuestionNodeRow[];
  textResponses: TextResponse[];
  uploadSlots: UploadSlot[];
  marks: Mark[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const totalAwarded = calculateAwardedMarks(marks);

  async function saveMarking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const awardedMarks = Number(form.get("awarded_marks") || 0);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.functions.invoke("save-marking", {
      body: {
        attempt_id: attemptId,
        marks: [{ awarded_marks: awardedMarks, notes: String(form.get("mark_notes") ?? "") }],
        annotations: [
          {
            annotation_type: "feedback",
            body: String(form.get("feedback_note") ?? ""),
            anchor_json: {},
          },
        ],
      },
    });
    setMessage(error?.message ?? "Marking saved.");
  }

  async function releaseFeedback() {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.functions.invoke("release-feedback", {
      body: { attempt_id: attemptId, summary_text: summaryText, visible_to_student: true },
    });
    setMessage(error?.message ?? "Feedback released to the student.");
  }

  async function exportPacket() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke("owner-download-marking-packet", {
      body: { attempt_id: attemptId },
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `exam-vault-marking-packet-${attemptId}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Marking packet exported.");
  }

  return (
    <form className="grid gap-4" onSubmit={saveMarking}>
      <div className="rounded-md border border-[var(--border)] bg-white p-3 text-sm leading-6 text-[var(--muted)]">
        {textResponses.length} typed response(s), {uploadSlots.length} upload slot(s), {questionNodes.length} question node(s).
        Current saved total: {totalAwarded} mark(s).
      </div>
      <Field label="Awarded marks">
        <Input name="awarded_marks" type="number" min={0} step="0.5" defaultValue={0} />
      </Field>
      <Field label="Marker notes">
        <Textarea name="mark_notes" placeholder="Private marking note or rubric rationale." />
      </Field>
      <Field label="Feedback note">
        <Textarea name="feedback_note" placeholder="Feedback visible after explicit release." />
      </Field>
      <Field label="Release summary">
        <Textarea value={summaryText} onChange={(event) => setSummaryText(event.target.value)} placeholder="Short summary for the student." />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">
          <Save size={16} aria-hidden="true" />
          Save marking
        </Button>
        <Button type="button" variant="secondary" onClick={() => void releaseFeedback()}>
          <Send size={16} aria-hidden="true" />
          Release feedback
        </Button>
        <Button type="button" variant="secondary" onClick={() => void exportPacket()}>
          <Download size={16} aria-hidden="true" />
          Export packet
        </Button>
      </div>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
