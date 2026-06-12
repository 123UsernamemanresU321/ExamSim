"use client";

import { useMemo, useState } from "react";
import type { QuestionNode } from "@/lib/assessment-package";
import { flattenQuestionNodes } from "@/lib/assessment-package";
import type { UploadSlot } from "@/types/database";

type NavigatorFilter = "all" | "unanswered" | "flagged" | "upload_required" | "uploaded" | "missing";

export function QuestionNavigator({
  questions,
  responses = [],
  annotations = [],
  uploadSlots = [],
}: {
  questions: QuestionNode[];
  responses?: { question_node_id: string; answer_text: string }[];
  annotations?: { question_node_id: string | null; annotation_type: string; body: string }[];
  uploadSlots?: UploadSlot[];
}) {
  const [filter, setFilter] = useState<NavigatorFilter>("all");
  const nodes = useMemo(() => flattenQuestionNodes(questions).filter((node) => node.node_type !== "section"), [questions]);
  const visibleNodes = useMemo(() => {
    return nodes.filter((node) => {
      const slot = uploadSlots.find((item) => item.question_node_id === node.node_id);
      const slotStatus = slot?.status ?? null;
      const hasResponse = Boolean(responses.find((item) => item.question_node_id === node.node_id && item.answer_text.trim()));
      const isFlagged = annotations.some((item) => item.question_node_id === node.node_id && item.annotation_type === "student_flag" && item.body !== "unflagged");
      if (filter === "flagged") return isFlagged;
      if (filter === "upload_required") return Boolean(slot);
      if (filter === "uploaded") return slotStatus === "uploaded" || slotStatus === "blank_placeholder";
      if (filter === "missing") return Boolean(slot) && slotStatus !== "uploaded" && slotStatus !== "blank_placeholder";
      if (filter === "unanswered") {
        if (slot) return slotStatus !== "uploaded" && slotStatus !== "blank_placeholder";
        return node.response_mode !== "none" && !hasResponse;
      }
      return true;
    });
  }, [annotations, filter, nodes, responses, uploadSlots]);

  return (
    <aside className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]" aria-label="Question navigator">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">Questions</h2>
        <span className="font-mono text-[11px] text-[var(--muted)]">{visibleNodes.length}/{nodes.length}</span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1 text-[11px] font-semibold">
        {[
          ["all", "All"],
          ["unanswered", "Open"],
          ["flagged", "Flagged"],
          ["upload_required", "Uploads"],
          ["uploaded", "Done"],
          ["missing", "Missing"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value as NavigatorFilter)}
            className={`rounded-[2px] border px-2 py-1.5 transition-colors ${
              filter === value
                ? "border-[var(--primary)] bg-[var(--primary)] !text-white"
                : "border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--surface-muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <nav className="flex flex-col gap-2">
        {visibleNodes.map((node) => (
          <a
            key={node.node_id}
            href={`#${node.node_id}`}
            className={`relative flex min-h-9 items-center rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm font-semibold transition-colors hover:bg-[var(--surface-panel)] ${
              node.node_type === "subquestion" ? "ml-4" : node.node_type === "part" ? "ml-8" : ""
            }`}
          >
            {(node.node_type === "subquestion" || node.node_type === "part") && (
              <div
                className="absolute bottom-1/2 left-[-0.75rem] top-[-1rem] w-2 rounded-bl-[2px] border-b-2 border-l-2 border-[var(--border)] opacity-60"
                aria-hidden="true"
              />
            )}
            {node.node_key}
          </a>
        ))}
        {!visibleNodes.length ? <p className="rounded-[2px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)]">No questions match this filter.</p> : null}
      </nav>
    </aside>
  );
}
