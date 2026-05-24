"use client";

import { useState } from "react";
import { Download, Send, Save, FileText, Paperclip, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { buildMarkingTree, getMarkableLeafNodes, getSelectableMarkingGroups } from "@/lib/marking-tree";
import type { Mark, QuestionNodeRow, TextResponse, UploadSlot } from "@/types/database";

type LocalMarkState = {
  awarded: string;
  notes: string;
  binaryDecision: BinaryMarkDecision;
};

export function MarkingWorkspaceForm({
  attemptId,
  questionNodes,
  textResponses,
  uploadSlots,
  marks: initialMarks,
  annotations = [],
}: {
  attemptId: string;
  questionNodes: QuestionNodeRow[];
  textResponses: TextResponse[];
  uploadSlots: UploadSlot[];
  marks: Mark[];
  annotations?: { question_node_id: string; annotation_type: string; content?: string }[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const activeNodes = getSelectableMarkingGroups(buildMarkingTree(questionNodes)).flatMap(getMarkableLeafNodes);
  const [localMarks, setLocalMarks] = useState<Record<string, LocalMarkState>>(
    activeNodes.reduce((acc, node) => {
      const existing = initialMarks.find((m) => m.question_node_id === node.id);
      acc[node.id] = {
        awarded: existing ? String(existing.awarded_marks) : "",
        notes: existing?.notes ?? "",
        binaryDecision: binaryMarkDecisionFromAwarded(existing?.awarded_marks, node.marks ?? 0),
      };
      return acc;
    }, {} as Record<string, LocalMarkState>),
  );

  const totalAwarded = Object.values(localMarks).reduce((sum, m) => sum + (Number(m.awarded) || 0), 0);

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
      alert("Could not generate download link: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }

  async function saveMarking(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    try {
      const markPayload = activeNodes
        .flatMap((node) => {
          const local = localMarks[node.id];
          if (responseModeUsesBinaryMarking(node.response_mode)) {
            const awarded = markForBinaryDecision(local.binaryDecision, node.marks ?? 0);
            return awarded === null ? [] : [{
              question_node_id: node.id,
              awarded_marks: awarded,
              notes: local.notes,
            }];
          }
          if (local.awarded.trim() === "") return [];
          return [{
            question_node_id: node.id,
            awarded_marks: Number(local.awarded),
            notes: local.notes,
          }];
        });

      await invokeEdgeFunction(supabase, "save-marking", {
        body: {
          attempt_id: attemptId,
          marks: markPayload,
          annotations: [],
        },
        requiresAal2: true,
      });
      setMessage("All marks saved successfully.");
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
      const packet = await invokeEdgeFunction<{ marking_packet_zip?: { download_url?: string | null } }>(
        supabase,
        "owner-download-marking-packet",
        {
          body: { attempt_id: attemptId },
          requiresAal2: true,
        },
      );
      if (packet?.marking_packet_zip?.download_url) {
        window.location.href = packet.marking_packet_zip.download_url;
        setMessage("Marking ZIP generated.");
        return;
      }
      setMessage("Export completed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export marking packet.");
    }
  }

  return (
    <div className="grid gap-6">
      <div className="sticky top-24 z-10 flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Total Awarded</p>
          <p className="text-2xl font-bold text-[var(--ink)]">{totalAwarded} marks</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={saveMarking}>
            <Save size={16} />
            Save all
          </Button>
          <Button type="button" variant="secondary" onClick={() => void exportPacket()}>
            <Download size={16} />
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {activeNodes.map((node) => {
          const response = textResponses.find((r) => r.question_node_id === node.id);
          const slot = uploadSlots.find((s) => s.question_node_id === node.id);
          const state = localMarks[node.id];
          const usesBinaryMarking = responseModeUsesBinaryMarking(node.response_mode);

          return (
            <section key={node.id} className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {annotations.some(a => a.question_node_id === node.id && a.annotation_type === "student_flag" && a.content === "flagged") && (
                    <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600" title="Flagged by student">
                      <AlertCircle size={14} />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-[var(--ink)]">
                      {node.node_key}. {node.title || "Question"}
                    </h3>
                    <p className="text-xs text-[var(--muted)]">Maximum: {node.marks ?? 0} marks</p>
                  </div>
                </div>
                {usesBinaryMarking ? (
                  <div className="grid min-w-64 grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={state.binaryDecision === "correct" ? "primary" : "secondary"}
                      className={state.binaryDecision === "correct" ? "!text-white" : ""}
                      onClick={() =>
                        setLocalMarks((prev) => ({
                          ...prev,
                          [node.id]: { ...prev[node.id], binaryDecision: "correct", awarded: String(node.marks ?? 0) },
                        }))
                      }
                    >
                      Correct
                    </Button>
                    <Button
                      type="button"
                      variant={state.binaryDecision === "incorrect" ? "primary" : "secondary"}
                      className={state.binaryDecision === "incorrect" ? "!text-white" : ""}
                      onClick={() =>
                        setLocalMarks((prev) => ({
                          ...prev,
                          [node.id]: { ...prev[node.id], binaryDecision: "incorrect", awarded: "0" },
                        }))
                      }
                    >
                      Incorrect
                    </Button>
                  </div>
                ) : (
                  <Input
                    className="w-24 text-right font-bold"
                    type="number"
                    min={0}
                    max={node.marks ?? 100}
                    step={0.5}
                    value={state.awarded}
                    onChange={(e) =>
                      setLocalMarks((prev) => ({
                        ...prev,
                        [node.id]: { ...prev[node.id], awarded: e.target.value },
                      }))
                    }
                  />
                )}
              </div>

              {response?.answer_text ? (
                <div className="mb-3 rounded-md bg-[var(--surface-muted)] p-3 text-sm">
                  <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-[var(--subtle)]">
                    <FileText size={12} /> Typed Response
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{formatStoredResponse(response.answer_text, node)}</p>
                </div>
              ) : null}

              {slot?.object_path ? (
                <div className="mb-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 text-xs"
                    onClick={() => downloadFile(slot.object_path!)}
                  >
                    <Paperclip size={14} />
                    Download student file ({slot.status})
                  </Button>
                </div>
              ) : null}

              <Textarea
                className="mt-2 text-sm"
                placeholder="Marking notes..."
                value={state.notes}
                onChange={(e) =>
                  setLocalMarks((prev) => ({
                    ...prev,
                    [node.id]: { ...prev[node.id], notes: e.target.value },
                  }))
                }
              />
            </section>
          );
        })}
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
        <h3 className="mb-4 font-semibold">Feedback Release</h3>
        <Textarea
          className="mb-4"
          placeholder="Overall feedback for the student..."
          value={summaryText}
          onChange={(e) => setSummaryText(e.target.value)}
        />
        <Button className="w-full" type="button" variant="secondary" onClick={() => void releaseFeedback()}>
          <Send size={16} />
          Release feedback to student
        </Button>
      </section>

      {message ? (
        <p className="text-center text-sm font-medium text-[var(--muted)]" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
