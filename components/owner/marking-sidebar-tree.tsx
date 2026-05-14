"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Circle, FileText, Flag, Ghost, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  buildMarkingTree,
  computeMarkingTotals,
  findSelectableGroupForNode,
  getMarkableLeafNodes,
  getSelectableMarkingGroups,
  isMarkableMarkingNode,
  type MarkingTreeNode,
} from "@/lib/marking-tree";
import { cn } from "@/lib/utils";
import type { Mark, QuestionNodeRow, SubmissionAnnotation, TextResponse, UploadSlot } from "@/types/database";

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
  const tree = useMemo(() => buildMarkingTree(questionNodes), [questionNodes]);
  const groups = useMemo(() => getSelectableMarkingGroups(tree), [tree]);
  const activeLeaves = useMemo(() => groups.flatMap(getMarkableLeafNodes), [groups]);
  const markedLeafCount = activeLeaves.filter((node) => marks.some((mark) => mark.question_node_id === node.id)).length;
  const progress = activeLeaves.length ? (markedLeafCount / activeLeaves.length) * 100 : 0;

  function selectNode(node: MarkingTreeNode) {
    const group = findSelectableGroupForNode(tree, node.id) ?? node;
    onSelect(group.id);
    window.setTimeout(() => {
      document.getElementById(`mark-node-${node.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 60);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--subtle)]">Question Tree</h2>
        <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
          <span>Leaf progress</span>
          <span className="font-semibold text-[var(--ink)]">
            {markedLeafCount} / {activeLeaves.length} Marked
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {tree.map((node) => (
          <SidebarNode
            key={node.id}
            node={node}
            depth={0}
            selectedNodeId={selectedNodeId}
            onSelect={selectNode}
            marks={marks}
            uploadSlots={uploadSlots}
            textResponses={textResponses}
            annotations={annotations}
          />
        ))}
      </nav>
    </div>
  );
}

function SidebarNode({
  node,
  depth,
  selectedNodeId,
  onSelect,
  marks,
  uploadSlots,
  textResponses,
  annotations,
}: {
  node: MarkingTreeNode;
  depth: number;
  selectedNodeId: string | null;
  onSelect: (node: MarkingTreeNode) => void;
  marks: Mark[];
  uploadSlots: UploadSlot[];
  textResponses: TextResponse[];
  annotations: SubmissionAnnotation[];
}) {
  const isSection = node.node_type === "section";
  const selectableGroupId = selectedNodeId;
  const isSelected = node.id === selectableGroupId;
  const status = getNodeStatus(node, marks, uploadSlots, textResponses, annotations);
  const totals = computeMarkingTotals(node, marks);
  const hasChildren = node.children.length > 0;

  if (isSection) {
    return (
      <div className={cn(depth > 0 && "ml-3")}>
        <div className="mb-1 mt-4 px-3 text-xs font-bold uppercase text-[var(--subtle)]">
          {node.title || node.node_key}
        </div>
        {node.children.map((child) => (
          <SidebarNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            marks={marks}
            uploadSlots={uploadSlots}
            textResponses={textResponses}
            annotations={annotations}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn(depth > 0 && "border-l border-slate-200 pl-2")} style={{ marginLeft: depth > 0 ? 10 : 0 }}>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={cn(
          "group my-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]",
          isSelected && "bg-blue-50 text-blue-700 font-medium",
        )}
      >
        <div className="flex-shrink-0">
          {status === "marked" ? (
            <CheckCircle2 size={15} className="text-green-500" />
          ) : status === "flagged" ? (
            <Flag size={15} className="fill-red-500 text-red-500" />
          ) : (
            <Circle size={15} className="text-[var(--border)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm", depth > 0 && "text-xs")}>{node.node_key}</span>
            {status && status !== "marked" && status !== "flagged" ? <StatusBadge status={status} /> : null}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] font-semibold text-[var(--muted)]">
            <span className="truncate">
              {hasChildren ? `${totals.markableLeafCount} parts` : node.response_mode.replaceAll("_", " ")}
              {node.inferred_parent_id ? " • inferred" : ""}
            </span>
            <span className="tabular-nums">
              {totals.awarded}/{totals.max}
            </span>
          </div>
        </div>
      </button>

      {hasChildren ? (
        <div>
          {node.children.map((child) => (
            <SidebarNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              marks={marks}
              uploadSlots={uploadSlots}
              textResponses={textResponses}
              annotations={annotations}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getNodeStatus(
  node: MarkingTreeNode,
  marks: Mark[],
  uploadSlots: UploadSlot[],
  textResponses: TextResponse[],
  annotations: SubmissionAnnotation[],
): NodeStatus | null {
  if (!isMarkableMarkingNode(node)) {
    const childStatuses = getMarkableLeafNodes(node)
      .map((leaf) => getLeafStatus(leaf.id, marks, uploadSlots, textResponses, annotations))
      .filter(Boolean) as NodeStatus[];
    if (childStatuses.includes("flagged")) return "flagged";
    if (childStatuses.includes("unreadable")) return "unreadable";
    if (childStatuses.length > 0 && childStatuses.every((status) => status === "marked")) return "marked";
    if (childStatuses.includes("missing")) return "missing";
    if (childStatuses.includes("uploaded")) return "uploaded";
    if (childStatuses.includes("typed")) return "typed";
    if (childStatuses.includes("blank")) return "blank";
    return null;
  }

  return getLeafStatus(node.id, marks, uploadSlots, textResponses, annotations);
}

function getLeafStatus(
  nodeId: string,
  marks: Mark[],
  uploadSlots: UploadSlot[],
  textResponses: TextResponse[],
  annotations: SubmissionAnnotation[],
): NodeStatus | null {
  const mark = marks.find((item) => item.question_node_id === nodeId);
  if (mark) return "marked";

  if (annotations.some((item) => item.question_node_id === nodeId && item.annotation_type === "marker_flag")) return "flagged";
  if (annotations.some((item) => item.question_node_id === nodeId && item.annotation_type === "student_flag" && item.body === "flagged")) return "flagged";
  if (annotations.some((item) => item.question_node_id === nodeId && item.is_unreadable)) return "unreadable";

  const slot = uploadSlots.find((item) => item.question_node_id === nodeId);
  if (slot) {
    if (slot.status === "uploaded") return "uploaded";
    if (slot.status === "blank_placeholder") return "blank";
    if (slot.status === "missing") return "missing";
  }

  const response = textResponses.find((item) => item.question_node_id === nodeId);
  if (response?.answer_text) return "typed";

  return null;
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
    <Badge tone={config.tone} className="h-5 gap-1 px-1.5 text-[10px] font-bold uppercase tracking-tight">
      <config.icon size={10} />
      {config.label}
    </Badge>
  );
}
