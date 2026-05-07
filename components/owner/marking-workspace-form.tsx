"use client";

import { useState } from "react";
import { Download, Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { calculateAwardedMarks } from "@/lib/marking";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
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
    try {
      await invokeEdgeFunction(supabase, "save-marking", {
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
        requiresAal2: true,
      });
      setMessage("Marking saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save marking.");
    }
  }

  async function releaseFeedback() {
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "release-feedback", {
        body: { attempt_id: attemptId, summary_text: summaryText, visible_to_student: true },
        requiresAal2: true,
      });
      setMessage("Feedback released to the student.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not release feedback.");
    }
  }

  async function exportPacket() {
    const supabase = createSupabaseBrowserClient();
    try {
      const packet = await invokeEdgeFunction<{ marking_packet_zip?: { download_url?: string | null; encrypted?: boolean } }>(
        supabase,
        "owner-download-marking-packet",
        {
          body: { attempt_id: attemptId },
          requiresAal2: true,
        },
      );
      if (packet?.marking_packet_zip?.download_url) {
        window.location.href = packet.marking_packet_zip.download_url;
        setMessage(packet.marking_packet_zip.encrypted ? "Encrypted marking ZIP generated." : "Marking ZIP generated.");
        return;
      }
      setMessage("Marking packet export completed, but no download URL was returned.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export marking packet.");
    }
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
