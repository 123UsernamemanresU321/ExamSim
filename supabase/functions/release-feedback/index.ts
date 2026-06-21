import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const context = await requireInstitutionAal2(request, "moderation");
    const { user, admin, profile: ownerProfile, ownerProfileId } = context;
    const body = await readJson<{
      attempt_id: string;
      summary_text?: string;
      visible_to_student?: boolean;
      release_marks?: boolean;
      release_comments?: boolean;
      release_annotated_pdfs?: boolean;
      release_moderation_summary?: boolean;
      release_note?: string;
      release_checklist?: {
        marks_reviewed?: boolean;
        feedback_reviewed?: boolean;
        visibility_reviewed?: boolean;
      };
    }>(request);
    if (!body.attempt_id) return json({ error: "attempt_id is required" }, 400);
    if (!body.release_checklist?.marks_reviewed || !body.release_checklist.feedback_reviewed || !body.release_checklist.visibility_reviewed) {
      return json({ error: "Complete the feedback release checklist before release", code: "release_checklist_required" }, 409);
    }

    const [{ data: marks, error: marksError }, { data: attempt, error: attemptError }] = await Promise.all([
      admin.from("marks").select("question_node_id,awarded_marks").eq("attempt_id", body.attempt_id),
      admin.from("attempts").select("assessment_id,assessment_version_id,assessments!inner(owner_profile_id)").eq("id", body.attempt_id).single(),
    ]);
    if (marksError) throw marksError;
    if (attemptError) throw attemptError;
    assertInstitutionOwner((attempt.assessments as { owner_profile_id?: string } | null)?.owner_profile_id, ownerProfileId);

    const { data: gradingPolicy, error: policyError } = await admin
      .from("assessment_grading_policies")
      .select("double_marking,moderation_required")
      .eq("assessment_id", attempt.assessment_id)
      .maybeSingle();
    if (policyError) throw policyError;
    if (gradingPolicy?.double_marking || gradingPolicy?.moderation_required) {
      const { data: review, error: reviewError } = await admin
        .from("marking_reviews")
        .select("status,final_submission_id")
        .eq("attempt_id", body.attempt_id)
        .maybeSingle();
      if (reviewError) throw reviewError;
      if (!review || review.status !== "approved" || !review.final_submission_id) {
        throw new Error("Required marking moderation is not approved");
      }
    }

    // Fetch question nodes to get the total available marks
    const { data: nodes, error: nodesError } = await admin
      .from("question_nodes")
      .select("id, marks, parent_node_id")
      .eq("assessment_version_id", attempt.assessment_version_id);
    if (nodesError) throw nodesError;

    const totalAwarded = (marks ?? []).reduce((sum, mark) => sum + Number(mark.awarded_marks || 0), 0);
    const parentIds = new Set((nodes ?? []).map((node: { parent_node_id: string | null }) => node.parent_node_id).filter(Boolean));
    const markableLeafNodes = (nodes ?? [])
      .filter((node: { id: string; marks: number | null }) => !parentIds.has(node.id) && Number(node.marks ?? 0) > 0);
    const totalAvailable = markableLeafNodes
      .reduce((sum, node: { marks: number | null }) => sum + Number(node.marks || 0), 0);
    const markedQuestionIds = new Set((marks ?? []).map((mark: { question_node_id: string | null }) => mark.question_node_id).filter(Boolean));
    const missingMarkedQuestionIds = markableLeafNodes
      .filter((node: { id: string }) => !markedQuestionIds.has(node.id))
      .map((node: { id: string }) => node.id);
    if (missingMarkedQuestionIds.length) {
      return json({
        error: "Every markable question must have a saved mark, including zero for unanswered work",
        code: "incomplete_marking",
        missing_question_node_ids: missingMarkedQuestionIds,
      }, 409);
    }

    const { data: release, error: releaseError } = await admin
      .from("feedback_releases")
      .upsert(
        {
          attempt_id: body.attempt_id,
          released_by_profile_id: ownerProfile.id,
          summary_text: body.summary_text?.trim() || null,
          total_awarded_marks: totalAwarded,
          total_available_marks: totalAvailable,
          visible_to_student: body.visible_to_student ?? true,
          release_marks: body.release_marks ?? true,
          release_comments: body.release_comments ?? true,
          release_annotated_pdfs: body.release_annotated_pdfs ?? true,
          release_moderation_summary: body.release_moderation_summary ?? false,
          release_note: body.release_note?.trim() || null,
          revoked_at: null,
          released_at: new Date().toISOString(),
        },
        { onConflict: "attempt_id" },
      )
      .select("*")
      .single();
    if (releaseError) throw releaseError;

    // Mark the attempt as finished if it wasn't already
    await admin
      .from("attempts")
      .update({ state_cache: "FINISHED_REVIEW" })
      .eq("id", body.attempt_id);

    await auditOwnerAction(ownerProfileId, user.id, "feedback.released", "attempts", body.attempt_id, {
      total_awarded_marks: totalAwarded,
      total_available_marks: totalAvailable,
      release_checklist: body.release_checklist,
    });

    return json({ ok: true, release });
  } catch (error) {
    return errorResponse(error, "release-feedback failed");
  }
});
