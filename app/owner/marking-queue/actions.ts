"use server";

import { revalidatePath } from "next/cache";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateAssessmentGradingPolicyAction(assessmentId: string, formData: FormData) {
  const context = await requireInstitutionPermission("assessment_authoring");
  const supabase = await createSupabaseServerClient();
  const { data: assessment, error: assessmentError } = await supabase.from("assessments").select("id,owner_profile_id").eq("id", assessmentId).maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment || assessment.owner_profile_id !== context.ownerProfileId) throw new Error("Assessment is outside this institution");
  const policy = {
    owner_profile_id: context.ownerProfileId,
    assessment_id: assessmentId,
    anonymous_grading: formData.get("anonymous_grading") === "on",
    double_marking: formData.get("double_marking") === "on",
    moderation_required: formData.get("moderation_required") === "on",
    identity_reveal_requires_reason: true,
    double_mark_delta_threshold: clampNumber(formData.get("double_mark_delta_threshold"), 0, 100, 2),
  };
  const { error } = await supabase.from("assessment_grading_policies").upsert(policy, { onConflict: "assessment_id" });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: "grading_policy.updated", targetTable: "assessment_grading_policies", targetId: assessmentId, metadata: policy });
  revalidatePath(`/owner/assessments/${assessmentId}`);
  revalidatePath("/owner/marking-queue");
}

export async function submitIndependentMarkingAction(attemptId: string) {
  const context = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const { data: attempt, error: attemptError } = await supabase.from("attempts").select("id,assessment_id").eq("id", attemptId).maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) throw new Error("Attempt not found");
  const { data: assessment, error: assessmentError } = await supabase.from("assessments").select("owner_profile_id").eq("id", attempt.assessment_id).single();
  if (assessmentError) throw assessmentError;
  if (assessment.owner_profile_id !== context.ownerProfileId) throw new Error("Attempt is outside this institution");
  if (context.role === "marker") {
    const { data: assignment, error: assignmentError } = await supabase
      .from("marker_assignments")
      .select("id")
      .eq("owner_profile_id", context.ownerProfileId)
      .eq("attempt_id", attemptId)
      .eq("marker_profile_id", context.profileId)
      .in("status", ["assigned", "in_progress"])
      .limit(1);
    if (assignmentError) throw assignmentError;
    if (!assignment?.length) throw new Error("Marker assignment required for this attempt");
  }

  const { data: submittedRows, error } = await supabase.rpc("submit_marking_snapshot", {
    p_owner_profile_id: context.ownerProfileId,
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  const submission = Array.isArray(submittedRows) ? submittedRows[0] : null;
  if (!submission) throw new Error("Marking snapshot was not created");
  const { error: reviewError } = await supabase.rpc("reconcile_marking_review", { p_owner_profile_id: context.ownerProfileId, p_attempt_id: attemptId });
  if (reviewError) throw reviewError;
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: "marking_submission.submitted", targetTable: "marking_submissions", targetId: submission.submission_id, metadata: { attempt_id: attemptId, marking_round: submission.marking_round, total_awarded_marks: submission.total_awarded_marks } });
  revalidatePath(`/owner/attempts/${attemptId}/mark`);
  revalidatePath("/owner/marking-queue/moderation");
}

export async function reviewMarkingAction(reviewId: string, formData: FormData) {
  const context = await requireInstitutionPermission("moderation");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "approved" && decision !== "rejected") throw new Error("Unsupported review decision");
  const comment = String(formData.get("reviewer_comment") ?? "").trim().slice(0, 2000) || null;
  const supabase = await createSupabaseServerClient();
  const { data: review, error: reviewError } = await supabase.from("marking_reviews").select("*").eq("id", reviewId).maybeSingle();
  if (reviewError) throw reviewError;
  if (!review || review.owner_profile_id !== context.ownerProfileId) throw new Error("Review is outside this institution");
  const requestedFinalSubmissionId = String(formData.get("final_submission_id") ?? "").trim();
  const finalSubmissionId = decision === "approved" ? requestedFinalSubmissionId || review.primary_submission_id : null;
  if (finalSubmissionId && ![review.primary_submission_id, review.secondary_submission_id].includes(finalSubmissionId)) throw new Error("Final submission must belong to this review");
  const { error } = await supabase.rpc("review_marking_submission", {
    p_owner_profile_id: context.ownerProfileId,
    p_review_id: reviewId,
    p_decision: decision,
    p_final_submission_id: finalSubmissionId,
    p_reviewer_comment: comment,
  });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId: context.ownerProfileId, action: `marking_review.${decision}`, targetTable: "marking_reviews", targetId: reviewId, metadata: { attempt_id: review.attempt_id, final_submission_id: finalSubmissionId, reviewer_comment: comment } });
  revalidatePath("/owner/marking-queue/moderation");
  revalidatePath(`/owner/attempts/${review.attempt_id}/mark`);
}

function clampNumber(value: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
