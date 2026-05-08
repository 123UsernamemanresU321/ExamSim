"use client";

import { CheckCircle2, Circle, AlertCircle, FileText, Paperclip, Flag, Ghost } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionNodeRow, Mark, UploadSlot, TextResponse, SubmissionAnnotation } from "@/types/database";
import { Badge } from "@/components/ui/badge";

type NodeStatus = "missing" | "blank" | "typed" | "uploaded" | "marked" | "flagged" | "unreadable" | "late";

export function MarkingSidebarTree({
  questionNodes,
  selectedNodeId,
  onSelect,
  marks,
  uploadSlots,
  textResponses,
  annotations,
}: {
  questionNodes: QuestionNodeRow[];
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  marks: Mark[];
  uploadSlots: UploadSlot[];
  textResponses: TextResponse[];
  annotations: SubmissionAnnotation[];
}) {
  const activeNodes = questionNodes.filter((n) => n.node_type !== "section");
  const markedCount = activeNodes.filter((n) => marks.some((m) => m.question_node_id === n.id)).length;

  function getStatus(nodeId: string): NodeStatus | null {
    const mark = marks.find((m) => m.question_node_id === nodeId);
    if (mark) return "marked";

    if (annotations.some((a) => a.question_node_id === nodeId && a.annotation_type === "marker_flag")) return "flagged";
    if (annotations.some((a) => a.question_node_id === nodeId && a.annotation_type === "student_flag" && a.body === "flagged")) return "flagged";
    if (annotations.some((a) => a.question_node_id === nodeId && a.is_unreadable)) return "unreadable";

    const slot = uploadSlots.find((s) => s.question_node_id === nodeId);
    if (slot) {
      if (slot.status === "uploaded") return "uploaded";
      if (slot.status === "blank_placeholder") return "blank";
      if (slot.status === "missing") return "missing";
    }

    const response = textResponses.find((r) => r.question_node_id === nodeId);
    if (response?.answer_text) return "typed";

    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[var(--border)]">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--subtle)]">Question Tree</h2>
        <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
          <span>Progress</span>
          <span className="font-semibold text-[var(--ink)]">
            {markedCount} / {activeNodes.length} Marked
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${(markedCount / activeNodes.length) * 100}%` }}
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {questionNodes.map((node) => {
          const isSection = node.node_type === "section";
          const isSelected = node.id === selectedNodeId;
          const status = getStatus(node.id);

          return (
            <button
              key={node.id}
              onClick={() => onSelect(node.id)}
              className={cn(
                "group w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                isSection ? "mt-4 mb-1 cursor-default pointer-events-none" : "hover:bg-[var(--surface-muted)]",
                isSelected && !isSection && "bg-blue-50 text-blue-700 font-medium"
              )}
            >
              {isSection ? (
                <span className="text-xs font-bold uppercase text-[var(--subtle)]">{node.title || node.node_key}</span>
              ) : (
                <>
                  <div className="flex-shrink-0">
                    {status === "marked" ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : status === "flagged" ? (
                      <Flag size={16} className="text-red-500 fill-red-500" />
                    ) : (
                      <Circle size={16} className="text-[var(--border)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">
                        {node.node_key}
                      </span>
                      {status && status !== "marked" && status !== "flagged" && (
                        <StatusBadge status={status} />
                      )}
                    </div>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function StatusBadge({ status }: { status: NodeStatus }) {
  const configs: Record<NodeStatus, { label: string; tone: "success" | "warning" | "neutral" | "accent"; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
    uploaded: { label: "File", tone: "success", icon: Paperclip },
    typed: { label: "Typed", tone: "accent", icon: FileText },
    blank: { label: "Blank", tone: "neutral", icon: Ghost },
    missing: { label: "Missing", tone: "warning", icon: AlertCircle },
    unreadable: { label: "Broken", tone: "warning", icon: AlertCircle },
    flagged: { label: "Flag", tone: "accent", icon: Flag },
    marked: { label: "Done", tone: "success", icon: CheckCircle2 },
    late: { label: "Late", tone: "warning", icon: AlertCircle },
  };

  const config = configs[status];
  if (!config) return null;

  return (
    <Badge tone={config.tone} className="h-5 px-1.5 text-[10px] uppercase font-bold tracking-tight gap-1">
      <config.icon size={10} />
      {config.label}
    </Badge>
  );
}
