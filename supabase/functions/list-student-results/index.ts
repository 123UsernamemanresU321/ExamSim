import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    if (profile.app_role !== "student") return json({ error: "Student role required" }, 403);

    const { data: attempts, error: attemptError } = await admin
      .from("attempts")
      .select("id, assessment_id")
      .eq("assignee_profile_id", profile.id);
    if (attemptError) throw attemptError;

    const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
    if (!attemptIds.length) return json({ results: [] });

    const { data: releases, error: releaseError } = await admin
      .from("feedback_releases")
      .select("id, attempt_id, released_at, total_awarded_marks, total_available_marks, release_marks, release_comments, release_annotated_pdfs")
      .eq("visible_to_student", true)
      .is("revoked_at", null)
      .in("attempt_id", attemptIds)
      .order("released_at", { ascending: false });
    if (releaseError) throw releaseError;

    const assessmentIds = [...new Set((attempts ?? []).map((attempt) => attempt.assessment_id))];
    const { data: assessments, error: assessmentError } = assessmentIds.length
      ? await admin.from("assessments").select("id, title, paper_code").in("id", assessmentIds)
      : { data: [], error: null };
    if (assessmentError) throw assessmentError;

    const assessmentById = new Map((assessments ?? []).map((assessment) => [assessment.id, assessment]));
    const attemptById = new Map((attempts ?? []).map((attempt) => [attempt.id, attempt]));

    return json({
      results: (releases ?? []).map((release) => {
        const attempt = attemptById.get(release.attempt_id);
        const assessment = attempt ? assessmentById.get(attempt.assessment_id) : null;
        return {
          feedback_release_id: release.id,
          attempt_id: release.attempt_id,
          assessment_title: assessment?.title ?? "Untitled assessment",
          paper_code: assessment?.paper_code ?? null,
          released_at: release.released_at,
          total_awarded_marks: release.total_awarded_marks,
          total_available_marks: release.total_available_marks,
          release_marks: release.release_marks,
          release_comments: release.release_comments,
          release_annotated_pdfs: release.release_annotated_pdfs,
        };
      }),
    });
  } catch (error) {
    return errorResponse(error, "list-student-results failed");
  }
});
