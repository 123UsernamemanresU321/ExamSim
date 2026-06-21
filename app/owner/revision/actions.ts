"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rankRevisionCandidates, type RevisionWeakness } from "@/lib/examsim/adaptive-revision";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { asJson } from "@/lib/owner-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateRevisionSetAction(formData: FormData) {
  const studentProfileId = requiredId(formData, "student_profile_id");
  const requestedCount = Math.max(3, Math.min(20, Math.trunc(Number(formData.get("question_count") ?? 8))));
  const { ownerProfileId, profileId } = await requireInstitutionPermission("analytics");
  const supabase = await createSupabaseServerClient();
  const { data: studentLink, error: studentLinkError } = await supabase.from("owner_student_links").select("student_profile_id").eq("owner_profile_id", ownerProfileId).eq("student_profile_id", studentProfileId).maybeSingle();
  if (studentLinkError) throw studentLinkError;
  if (!studentLink) throw new Error("Select a student account managed by this institution.");

  const { data: attempts, error: attemptError } = await supabase.from("attempts").select("id,assessment_version_id").eq("assignee_profile_id", studentProfileId);
  if (attemptError) throw attemptError;
  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  if (!attemptIds.length) throw new Error("This student has no completed attempt evidence yet.");
  const { data: releases, error: releaseError } = await supabase.from("feedback_releases").select("attempt_id").in("attempt_id", attemptIds).eq("visible_to_student", true).is("revoked_at", null);
  if (releaseError) throw releaseError;
  const releasedAttemptIds = (releases ?? []).map((release) => release.attempt_id);
  if (!releasedAttemptIds.length) throw new Error("Release feedback before generating a student revision set.");
  const releasedAttempts = (attempts ?? []).filter((attempt) => releasedAttemptIds.includes(attempt.id));
  const versionIds = [...new Set(releasedAttempts.map((attempt) => attempt.assessment_version_id))];
  const [{ data: marks, error: markError }, { data: questions, error: questionError }] = await Promise.all([
    supabase.from("marks").select("attempt_id,question_node_id,awarded_marks").in("attempt_id", releasedAttemptIds),
    supabase.from("question_nodes").select("id,marks").in("assessment_version_id", versionIds),
  ]);
  if (markError) throw markError;
  if (questionError) throw questionError;
  const questionIds = (questions ?? []).map((question) => question.id);
  const [{ data: topicLinks, error: topicLinkError }, { data: standardLinks, error: standardLinkError }] = await Promise.all([
    questionIds.length ? supabase.from("question_topic_links").select("question_node_id,topic_tag_id").in("question_node_id", questionIds) : Promise.resolve({ data: [], error: null }),
    questionIds.length ? supabase.from("question_standard_links").select("question_node_id,curriculum_standard_id").in("question_node_id", questionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (topicLinkError) throw topicLinkError;
  if (standardLinkError) throw standardLinkError;
  const topicIds = [...new Set((topicLinks ?? []).map((link) => link.topic_tag_id))];
  const standardIds = [...new Set((standardLinks ?? []).map((link) => link.curriculum_standard_id))];
  const [{ data: topics, error: topicError }, { data: standards, error: standardError }, { data: candidateRows, error: candidateError }] = await Promise.all([
    topicIds.length ? supabase.from("topic_tags").select("id,tag").in("id", topicIds) : Promise.resolve({ data: [], error: null }),
    standardIds.length ? supabase.from("curriculum_standards").select("id,code,title").in("id", standardIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("question_bank_items").select("id,tags,curriculum_standard_ids,estimated_difficulty,readiness_status,do_not_reuse").eq("owner_profile_id", ownerProfileId).eq("readiness_status", "ready").eq("do_not_reuse", false).limit(500),
  ]);
  if (topicError) throw topicError;
  if (standardError) throw standardError;
  if (candidateError) throw candidateError;

  const maxByQuestion = new Map((questions ?? []).map((question) => [question.id, Math.max(0, Number(question.marks ?? 0))]));
  const topicNameById = new Map((topics ?? []).map((topic) => [topic.id, topic.tag]));
  const standardNameById = new Map((standards ?? []).map((standard) => [standard.id, `${standard.code} ${standard.title}`]));
  const topicIdsByQuestion = groupLinks(topicLinks ?? [], "topic_tag_id");
  const standardIdsByQuestion = groupLinks(standardLinks ?? [], "curriculum_standard_id");
  const weaknessTotals = new Map<string, { kind: "topic" | "standard"; loss: number; possible: number; label: string }>();
  for (const mark of marks ?? []) {
    if (!mark.question_node_id) continue;
    const possible = maxByQuestion.get(mark.question_node_id) ?? 0;
    if (possible <= 0) continue;
    const loss = Math.max(0, possible - Number(mark.awarded_marks ?? 0));
    for (const topicId of topicIdsByQuestion.get(mark.question_node_id) ?? []) addWeakness(weaknessTotals, `topic:${topicId}`, "topic", topicNameById.get(topicId) ?? topicId, loss, possible);
    for (const standardId of standardIdsByQuestion.get(mark.question_node_id) ?? []) addWeakness(weaknessTotals, `standard:${standardId}`, "standard", standardNameById.get(standardId) ?? standardId, loss, possible);
  }
  const weaknesses: RevisionWeakness[] = [...weaknessTotals.entries()].map(([composite, value]) => ({ key: composite.slice(composite.indexOf(":") + 1), kind: value.kind, lossRatio: value.possible ? value.loss / value.possible : 0 })).filter((weakness) => weakness.lossRatio >= 0.2);
  const ranked = rankRevisionCandidates({ weaknesses, candidates: (candidateRows ?? []).map((candidate) => ({ ...candidate, tags: candidate.tags ?? [], curriculum_standard_ids: candidate.curriculum_standard_ids ?? [], estimated_difficulty: candidate.estimated_difficulty == null ? null : Number(candidate.estimated_difficulty) })), limit: requestedCount });
  if (!ranked.length) throw new Error("No reviewed Question Library items match this student's released weaknesses. Add topic or standard tags, then retry.");
  const title = String(formData.get("title") ?? "").trim().slice(0, 160) || "Suggested revision set";
  const weakestLabels = [...weaknessTotals.values()].sort((a, b) => (b.loss / b.possible) - (a.loss / a.possible)).slice(0, 4).map((item) => item.label);
  const { data: set, error: setError } = await supabase.from("revision_sets").insert({ owner_profile_id: ownerProfileId, student_profile_id: studentProfileId, title, rationale: weakestLabels.length ? `Targets released evidence in ${weakestLabels.join(", ")}.` : "Targets released marking evidence.", status: "draft", source_analysis_json: asJson({ released_attempt_ids: releasedAttemptIds, weaknesses: [...weaknessTotals.values()] }), created_by_profile_id: profileId }).select("id").single();
  if (setError) throw setError;
  if (!set) throw new Error("Revision set could not be created.");
  const labelByKey = new Map<string, string>();
  for (const [key, value] of weaknessTotals) labelByKey.set(key.slice(key.indexOf(":") + 1), value.label);
  const { error: itemError } = await supabase.from("revision_set_items").insert(ranked.map((candidate, ordinal) => ({ revision_set_id: set.id, question_bank_item_id: candidate.id, ordinal, priority: candidate.priority, reason: candidate.reason.replace(/Targets (.+)/, (_match, values: string) => `Targets ${values.split(", ").map((value) => labelByKey.get(value.trim()) ?? value.trim()).join(", ")}`) })));
  if (itemError) throw itemError;
  await auditInstitutionAction({ ownerProfileId, action: "revision_set.generated", targetTable: "revision_sets", targetId: set.id, metadata: { student_profile_id: studentProfileId, released_attempt_count: releasedAttemptIds.length, item_count: ranked.length } });
  redirect(`/owner/revision/${set.id}`);
}

export async function removeRevisionSetItemAction(formData: FormData) {
  const setId = requiredId(formData, "revision_set_id");
  const itemId = requiredId(formData, "revision_set_item_id");
  const { ownerProfileId } = await requireInstitutionPermission("analytics");
  const supabase = await createSupabaseServerClient();
  await requireOwnedDraftSet(supabase, setId, ownerProfileId);
  const { error } = await supabase.from("revision_set_items").delete().eq("id", itemId).eq("revision_set_id", setId);
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "revision_set.item_removed", targetTable: "revision_sets", targetId: setId, metadata: { revision_set_item_id: itemId } });
  revalidatePath(`/owner/revision/${setId}`);
}

export async function assignRevisionSetAction(formData: FormData) {
  const setId = requiredId(formData, "revision_set_id");
  const { ownerProfileId, profileId } = await requireInstitutionPermission("analytics");
  const supabase = await createSupabaseServerClient();
  const set = await requireOwnedDraftSet(supabase, setId, ownerProfileId);
  const { count, error: countError } = await supabase.from("revision_set_items").select("id", { count: "exact", head: true }).eq("revision_set_id", set.id);
  if (countError) throw countError;
  if (!count) throw new Error("Add at least one reviewed question before assigning this set.");
  const now = new Date().toISOString();
  const { error: assignmentError } = await supabase.from("revision_set_assignments").upsert({ revision_set_id: set.id, student_profile_id: set.student_profile_id, assigned_by_profile_id: profileId, status: "assigned", assigned_at: now, completed_at: null }, { onConflict: "revision_set_id,student_profile_id" });
  if (assignmentError) throw assignmentError;
  const { error: setError } = await supabase.from("revision_sets").update({ status: "assigned", reviewed_by_profile_id: profileId, reviewed_at: now, updated_at: now }).eq("id", set.id).eq("owner_profile_id", ownerProfileId).eq("status", "draft");
  if (setError) throw setError;
  await auditInstitutionAction({ ownerProfileId, action: "revision_set.assigned", targetTable: "revision_sets", targetId: set.id, metadata: { student_profile_id: set.student_profile_id, item_count: count } });
  revalidatePath(`/owner/revision/${set.id}`);
  revalidatePath("/owner/revision");
}

async function requireOwnedDraftSet(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, setId: string, ownerProfileId: string) {
  const { data, error } = await supabase.from("revision_sets").select("id,owner_profile_id,student_profile_id,status").eq("id", setId).eq("owner_profile_id", ownerProfileId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Revision set not found in this institution.");
  if (data.status !== "draft") throw new Error("Assigned revision sets are frozen. Create a new draft to make changes.");
  return data;
}

function groupLinks<T extends { question_node_id: string }>(links: T[], field: keyof T) {
  const result = new Map<string, string[]>();
  for (const link of links) result.set(link.question_node_id, [...(result.get(link.question_node_id) ?? []), String(link[field])]);
  return result;
}

function addWeakness(map: Map<string, { kind: "topic" | "standard"; loss: number; possible: number; label: string }>, key: string, kind: "topic" | "standard", label: string, loss: number, possible: number) {
  const value = map.get(key) ?? { kind, label, loss: 0, possible: 0 };
  value.loss += loss;
  value.possible += possible;
  map.set(key, value);
}

function requiredId(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new Error(`${name} is required.`);
  return value;
}
