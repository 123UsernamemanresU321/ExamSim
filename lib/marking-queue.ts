import type { AttemptState } from "@/lib/constants";

export type MarkingQueueRow = {
  attempt_id: string;
  assessment_id?: string;
  assessment_title: string;
  paper_code: string | null;
  student_name: string;
  state?: AttemptState | string;
  missing_upload_slots: number;
  uploaded_slots: number;
  total_upload_slots: number;
  mark_count: number;
  markable_leaf_count: number;
  feedback_released: boolean;
  moderation_severity: string | null;
  incident_affected: boolean;
};

export type MarkingQueueSection =
  | "needs_marking"
  | "partially_marked"
  | "high_moderation_signal"
  | "missing_uploads"
  | "feedback_ready"
  | "released"
  | "incident_affected";

export function classifyMarkingQueueRow(row: MarkingQueueRow): MarkingQueueSection[] {
  const sections: MarkingQueueSection[] = [];
  const marked = row.mark_count;
  const total = row.markable_leaf_count;
  if (row.missing_upload_slots > 0) sections.push("missing_uploads");
  if (row.moderation_severity === "high" || row.moderation_severity === "medium") sections.push("high_moderation_signal");
  if (row.incident_affected) sections.push("incident_affected");
  if (row.feedback_released) sections.push("released");
  else if (total > 0 && marked >= total) sections.push("feedback_ready");
  else if (marked > 0) sections.push("partially_marked");
  else sections.push("needs_marking");
  return sections;
}

export function markingProgress(row: Pick<MarkingQueueRow, "mark_count" | "markable_leaf_count">) {
  if (!row.markable_leaf_count) return 0;
  return Math.min(100, Math.round((row.mark_count / row.markable_leaf_count) * 100));
}
