import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { loadStudentExamResources } from "../_shared/exam-resources.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    if (profile.app_role !== "student") return json(request, { error: "Student role required" }, 403);
    const body = await readJson<{ attempt_id?: string }>(request);
    const attemptId = String(body.attempt_id ?? "").trim();
    if (!attemptId) return json(request, { error: "attempt_id is required" }, 400);
    const { data: attempt, error } = await admin.from("attempts")
      .select("id,assessment_id,assessment_version_id,assignee_profile_id,start_at_utc,end_at_utc,upload_deadline_at_utc,paused_at,solutions_requested,exam_policy_json")
      .eq("id", attemptId)
      .maybeSingle();
    if (error) throw error;
    if (!attempt || attempt.assignee_profile_id !== profile.id) return json(request, { error: "Forbidden" }, 403);
    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      pausedAtUtc: attempt.paused_at,
      solutionsRequested: attempt.solutions_requested,
    });
    const resources = await loadStudentExamResources(admin, attempt, state);
    return json(request, { attempt_id: attempt.id, state, resources });
  } catch (error) {
    return errorResponse(request, error, "get-attempt-resources failed");
  }
});
