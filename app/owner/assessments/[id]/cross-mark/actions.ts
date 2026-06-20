"use server";

import { revalidatePath } from "next/cache";
import { buildAnswerGroupingDraft, validateAnswerGroupingForApply } from "@/lib/examsim/answer-grouping-review";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission, type InstitutionPermissionContext } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnswerGroupingRun, Json } from "@/types/database";

export async function createAnswerGroupingRunAction(assessmentId: string, questionNodeId: string) {
  const context = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const [{ data: assessment, error: assessmentError }, { data: question, error: questionError }] = await Promise.all([
    supabase.from("assessments").select("id,owner_profile_id").eq("id", assessmentId).maybeSingle(),
    supabase.from("question_nodes").select("id,assessment_version_id,response_mode").eq("id", questionNodeId).maybeSingle(),
  ]);
  if (assessmentError) throw assessmentError;
  if (questionError) throw questionError;
  if (!assessment || assessment.owner_profile_id !== context.ownerProfileId) throw new Error("Assessment is outside this institution");
  if (!question) throw new Error("Question not found");
  const { data: version, error: versionError } = await supabase.from("assessment_versions").select("assessment_id").eq("id", question.assessment_version_id).maybeSingle();
  if (versionError) throw versionError;
  if (!version || version.assessment_id !== assessmentId) throw new Error("Question is outside this assessment");

  const { data: attempts, error: attemptError } = await supabase
    .from("attempts")
    .select("id")
    .eq("assessment_id", assessmentId)
    .eq("assessment_version_id", question.assessment_version_id);
  if (attemptError) throw attemptError;
  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  if (!attemptIds.length) throw new Error("No attempts are available for this question");
  await assertMarkerCoverage(supabase, context, questionNodeId, attemptIds);

  const { data: responses, error: responseError } = await supabase
    .from("text_responses")
    .select("id,attempt_id,question_node_id,answer_text")
    .eq("question_node_id", questionNodeId)
    .in("attempt_id", attemptIds);
  if (responseError) throw responseError;
  if (!responses?.length) throw new Error("No typed or structured responses are available to group");
  const drafts = buildAnswerGroupingDraft(responses.map((response) => ({ ...response, response_mode: question.response_mode })));

  const { data: run, error: runError } = await supabase.from("answer_grouping_runs").insert({
    owner_profile_id: context.ownerProfileId,
    assessment_id: assessmentId,
    question_node_id: questionNodeId,
    created_by_profile_id: context.profileId,
    provider: "deterministic",
    status: "draft",
    response_count: responses.length,
  }).select("id").single();
  if (runError) throw runError;

  const { data: insertedGroups, error: groupError } = await supabase.from("answer_groups").insert(drafts.map((draft, ordinal) => ({
    owner_profile_id: context.ownerProfileId,
    run_id: run.id,
    ordinal,
    label: draft.label.slice(0, 240),
    normalized_answer: draft.normalizedAnswer,
    confidence: draft.confidence,
  }))).select("id,ordinal");
  if (groupError) {
    await supabase.from("answer_grouping_runs").delete().eq("id", run.id);
    throw groupError;
  }
  const groupByOrdinal = new Map((insertedGroups ?? []).map((group) => [group.ordinal, group.id]));
  const responseById = new Map(responses.map((response) => [response.id, response]));
  const memberRows = drafts.flatMap((draft, ordinal) => draft.memberResponseIds.map((responseId) => {
    const response = responseById.get(responseId);
    const groupId = groupByOrdinal.get(ordinal);
    if (!response || !groupId) throw new Error("Unable to preserve the complete response grouping");
    return {
      owner_profile_id: context.ownerProfileId,
      run_id: run.id,
      group_id: groupId,
      text_response_id: response.id,
      attempt_id: response.attempt_id,
      original_normalized_answer: draft.normalizedAnswer,
    };
  }));
  const { error: memberError } = await supabase.from("answer_group_members").insert(memberRows);
  if (memberError) {
    await supabase.from("answer_grouping_runs").delete().eq("id", run.id);
    throw memberError;
  }
  await insertGroupingAudit(supabase, context, run.id, "created", { response_count: responses.length, group_count: drafts.length });
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: "answer_grouping.created", targetTable: "answer_grouping_runs", targetId: run.id, metadata: { assessment_id: assessmentId, question_node_id: questionNodeId, response_count: responses.length } });
  revalidateCrossMark(assessmentId);
}

export async function moveAnswerGroupMemberAction(runId: string, memberId: string, formData: FormData) {
  const context = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const run = await loadOwnedRun(supabase, context, runId);
  const targetGroupId = String(formData.get("target_group_id") ?? "").trim();
  const [{ data: member, error: memberError }, { data: target, error: targetError }] = await Promise.all([
    supabase.from("answer_group_members").select("id,group_id,attempt_id").eq("id", memberId).eq("run_id", runId).maybeSingle(),
    supabase.from("answer_groups").select("id").eq("id", targetGroupId).eq("run_id", runId).maybeSingle(),
  ]);
  if (memberError) throw memberError;
  if (targetError) throw targetError;
  if (!member || !target) throw new Error("Grouping member or destination was not found");
  if (member.group_id === target.id) return;

  const sourceGroupId = member.group_id;
  const { error } = await supabase.from("answer_group_members").update({ group_id: target.id }).eq("id", member.id).eq("run_id", runId);
  if (error) throw error;
  await reopenGrouping(supabase, runId, [sourceGroupId, target.id]);
  const { count, error: countError } = await supabase.from("answer_group_members").select("id", { count: "exact", head: true }).eq("group_id", sourceGroupId);
  if (countError) throw countError;
  if (count === 0) {
    const { error: deleteError } = await supabase.from("answer_groups").delete().eq("id", sourceGroupId).eq("run_id", runId);
    if (deleteError) throw deleteError;
  }
  await insertGroupingAudit(supabase, context, runId, "member_moved", { member_id: member.id, attempt_id: member.attempt_id, from_group_id: sourceGroupId, to_group_id: target.id });
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: "answer_grouping.member_moved", targetTable: "answer_grouping_runs", targetId: runId, metadata: { member_id: member.id, from_group_id: sourceGroupId, to_group_id: target.id } });
  revalidateCrossMark(run.assessment_id);
}

export async function splitAnswerGroupMemberAction(runId: string, memberId: string) {
  const context = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const run = await loadOwnedRun(supabase, context, runId);
  const { data: member, error: memberError } = await supabase.from("answer_group_members").select("id,group_id,attempt_id,original_normalized_answer").eq("id", memberId).eq("run_id", runId).maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw new Error("Grouping member was not found");
  const { data: ordinalRows, error: ordinalError } = await supabase.from("answer_groups").select("ordinal").eq("run_id", runId).order("ordinal", { ascending: false }).limit(1);
  if (ordinalError) throw ordinalError;
  const { data: group, error: groupError } = await supabase.from("answer_groups").insert({
    owner_profile_id: context.ownerProfileId,
    run_id: runId,
    ordinal: Number(ordinalRows?.[0]?.ordinal ?? -1) + 1,
    label: (member.original_normalized_answer || "Manual review group").slice(0, 240),
    normalized_answer: member.original_normalized_answer,
    confidence: "manual_review",
  }).select("id").single();
  if (groupError) throw groupError;
  const { error } = await supabase.from("answer_group_members").update({ group_id: group.id }).eq("id", member.id);
  if (error) throw error;
  await reopenGrouping(supabase, runId, [member.group_id, group.id]);
  await insertGroupingAudit(supabase, context, runId, "group_split", { member_id: member.id, source_group_id: member.group_id, new_group_id: group.id });
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: "answer_grouping.group_split", targetTable: "answer_grouping_runs", targetId: runId, metadata: { member_id: member.id, new_group_id: group.id } });
  revalidateCrossMark(run.assessment_id);
}

export async function mergeAnswerGroupsAction(runId: string, formData: FormData) {
  const context = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const run = await loadOwnedRun(supabase, context, runId);
  const groupIds = [...new Set(formData.getAll("group_id").map(String).filter(Boolean))];
  if (groupIds.length < 2) throw new Error("Select at least two groups to merge");
  const { data: groups, error: groupError } = await supabase.from("answer_groups").select("id,ordinal").eq("run_id", runId).in("id", groupIds).order("ordinal");
  if (groupError) throw groupError;
  if (groups?.length !== groupIds.length) throw new Error("Every merged group must belong to this run");
  const targetId = groups[0].id;
  const mergedIds = groups.slice(1).map((group) => group.id);
  const { error: moveError } = await supabase.from("answer_group_members").update({ group_id: targetId }).eq("run_id", runId).in("group_id", mergedIds);
  if (moveError) throw moveError;
  const { error: deleteError } = await supabase.from("answer_groups").delete().eq("run_id", runId).in("id", mergedIds);
  if (deleteError) throw deleteError;
  await reopenGrouping(supabase, runId, [targetId]);
  await insertGroupingAudit(supabase, context, runId, "groups_merged", { target_group_id: targetId, merged_group_ids: mergedIds });
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: "answer_grouping.groups_merged", targetTable: "answer_grouping_runs", targetId: runId, metadata: { target_group_id: targetId, merged_group_ids: mergedIds } });
  revalidateCrossMark(run.assessment_id);
}

export async function approveAnswerGroupAction(groupId: string, formData: FormData) {
  const context = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const { data: group, error: groupError } = await supabase.from("answer_groups").select("*").eq("id", groupId).maybeSingle();
  if (groupError) throw groupError;
  if (!group || group.owner_profile_id !== context.ownerProfileId) throw new Error("Answer group is outside this institution");
  const run = await loadOwnedRun(supabase, context, group.run_id);
  if (run.status === "applied" || run.status === "cancelled") throw new Error("Applied or cancelled grouping runs cannot be edited");
  const { data: question, error: questionError } = await supabase.from("question_nodes").select("marks").eq("id", run.question_node_id).maybeSingle();
  if (questionError) throw questionError;
  const questionMaximum = Number(question?.marks);
  const awardedMarks = Number(formData.get("suggested_awarded_marks"));
  validateAnswerGroupingForApply([{ id: group.id, approved: true, suggestedAwardedMarks: awardedMarks, memberCount: 1 }], questionMaximum);
  const feedbackText = String(formData.get("feedback_text") ?? "").trim().slice(0, 2000) || null;
  const { error } = await supabase.from("answer_groups").update({ approved: true, suggested_awarded_marks: awardedMarks, feedback_text: feedbackText }).eq("id", group.id);
  if (error) throw error;
  const { data: groups, error: allGroupsError } = await supabase.from("answer_groups").select("id,approved").eq("run_id", run.id);
  if (allGroupsError) throw allGroupsError;
  const reviewed = Boolean(groups?.length) && groups!.every((candidate) => candidate.id === group.id || candidate.approved);
  const { error: runError } = await supabase.from("answer_grouping_runs").update({ status: reviewed ? "reviewed" : "draft" }).eq("id", run.id);
  if (runError) throw runError;
  await insertGroupingAudit(supabase, context, run.id, "group_approved", { group_id: group.id, awarded_marks: awardedMarks, reviewed });
  if (reviewed) await insertGroupingAudit(supabase, context, run.id, "run_reviewed", { group_count: groups?.length ?? 0 });
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: "answer_grouping.group_approved", targetTable: "answer_grouping_runs", targetId: run.id, metadata: { group_id: group.id, awarded_marks: awardedMarks, reviewed } });
  revalidateCrossMark(run.assessment_id);
}

export async function applyAnswerGroupingRunAction(runId: string) {
  const context = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const run = await loadOwnedRun(supabase, context, runId);
  const [{ data: question, error: questionError }, { data: groups, error: groupError }, { data: members, error: memberError }] = await Promise.all([
    supabase.from("question_nodes").select("marks").eq("id", run.question_node_id).maybeSingle(),
    supabase.from("answer_groups").select("*").eq("run_id", run.id),
    supabase.from("answer_group_members").select("group_id,attempt_id").eq("run_id", run.id),
  ]);
  if (questionError) throw questionError;
  if (groupError) throw groupError;
  if (memberError) throw memberError;
  await assertMarkerCoverage(supabase, context, run.question_node_id, [...new Set((members ?? []).map((member) => member.attempt_id))]);
  validateAnswerGroupingForApply((groups ?? []).map((group) => ({
    id: group.id,
    approved: group.approved,
    suggestedAwardedMarks: group.suggested_awarded_marks,
    memberCount: (members ?? []).filter((member) => member.group_id === group.id).length,
  })), Number(question?.marks));
  const { data: appliedCount, error } = await supabase.rpc("apply_answer_grouping_run", { p_run_id: run.id, p_actor_profile_id: context.profileId });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: "answer_grouping.marks_applied", targetTable: "answer_grouping_runs", targetId: run.id, metadata: { applied_count: appliedCount, question_node_id: run.question_node_id } });
  revalidateCrossMark(run.assessment_id);
  revalidatePath("/owner/marking-queue");
}

async function loadOwnedRun(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  context: InstitutionPermissionContext,
  runId: string,
) {
  const { data: run, error } = await supabase.from("answer_grouping_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw error;
  if (!run || run.owner_profile_id !== context.ownerProfileId) throw new Error("Answer grouping run is outside this institution");
  return run as AnswerGroupingRun;
}

async function assertMarkerCoverage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  context: InstitutionPermissionContext,
  questionNodeId: string,
  attemptIds: string[],
) {
  if (context.role !== "marker" || !attemptIds.length) return;
  const { data: assignments, error } = await supabase
    .from("marker_assignments")
    .select("attempt_id,question_node_id")
    .eq("owner_profile_id", context.ownerProfileId)
    .eq("marker_profile_id", context.profileId)
    .in("attempt_id", attemptIds)
    .in("status", ["assigned", "in_progress"]);
  if (error) throw error;
  const covered = new Set((assignments ?? []).filter((assignment) => !assignment.question_node_id || assignment.question_node_id === questionNodeId).map((assignment) => assignment.attempt_id));
  if (attemptIds.some((attemptId) => !covered.has(attemptId))) throw new Error("Marker assignments must cover every response in this grouping run");
}

async function reopenGrouping(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  runId: string,
  groupIds: string[],
) {
  const { error: groupError } = await supabase.from("answer_groups").update({ approved: false, suggested_awarded_marks: null }).eq("run_id", runId).in("id", groupIds);
  if (groupError) throw groupError;
  const { error: runError } = await supabase.from("answer_grouping_runs").update({ status: "draft" }).eq("id", runId);
  if (runError) throw runError;
}

async function insertGroupingAudit(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  context: InstitutionPermissionContext,
  runId: string,
  eventType: "created" | "member_moved" | "group_split" | "groups_merged" | "group_approved" | "run_reviewed",
  payload: Json,
) {
  const { error } = await supabase.from("answer_group_audit_events").insert({
    owner_profile_id: context.ownerProfileId,
    run_id: runId,
    actor_profile_id: context.profileId,
    event_type: eventType,
    payload_json: payload,
  });
  if (error) throw error;
}

function revalidateCrossMark(assessmentId: string) {
  revalidatePath(`/owner/assessments/${assessmentId}/cross-mark`);
}
