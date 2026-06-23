import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { loadStudentExamResources } from "../_shared/exam-resources.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabase.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{ guest_token?: string; attempt_id?: string }>(request);
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: String(attempt.start_at_utc),
      endAtUtc: String(attempt.end_at_utc),
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc ? String(attempt.upload_deadline_at_utc) : null,
      pausedAtUtc: attempt.paused_at ? String(attempt.paused_at) : null,
      solutionsRequested: Boolean(attempt.solutions_requested),
    });
    const resources = await loadStudentExamResources(getAdminClient(), {
      assessment_id: String(attempt.assessment_id),
      assessment_version_id: String(attempt.assessment_version_id),
      exam_policy_json: attempt.exam_policy_json,
    }, state);
    return json(request, { attempt_id: attempt.id, state, resources });
  } catch (error) {
    return errorResponse(request, error, "guest-get-attempt-resources failed");
  }
});
