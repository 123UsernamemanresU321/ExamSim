import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AnswerGroupAuditEvent,
  AnswerGroupMember,
  AnswerGroupingRun,
  AnswerGroupRow,
} from "@/types/database";

export type AnswerGroupingReviewState = {
  run: AnswerGroupingRun;
  groups: AnswerGroupRow[];
  members: AnswerGroupMember[];
  auditEvents: AnswerGroupAuditEvent[];
};

export async function getLatestAnswerGroupingReview(
  assessmentId: string,
  questionNodeId: string,
): Promise<AnswerGroupingReviewState | null> {
  const supabase = await createSupabaseServerClient();
  const { data: run, error: runError } = await supabase
    .from("answer_grouping_runs")
    .select("*")
    .eq("assessment_id", assessmentId)
    .eq("question_node_id", questionNodeId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw runError;
  if (!run) return null;

  const [{ data: groups, error: groupError }, { data: members, error: memberError }, { data: auditEvents, error: auditError }] = await Promise.all([
    supabase.from("answer_groups").select("*").eq("run_id", run.id).order("ordinal"),
    supabase.from("answer_group_members").select("*").eq("run_id", run.id).order("created_at"),
    supabase.from("answer_group_audit_events").select("*").eq("run_id", run.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (groupError) throw groupError;
  if (memberError) throw memberError;
  if (auditError) throw auditError;

  return {
    run: run as AnswerGroupingRun,
    groups: (groups ?? []) as AnswerGroupRow[],
    members: (members ?? []) as AnswerGroupMember[],
    auditEvents: (auditEvents ?? []) as AnswerGroupAuditEvent[],
  };
}
