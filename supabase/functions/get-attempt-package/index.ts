import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string; state_token: string }>(request);
    if (!body.attempt_id || !body.state_token) return json({ error: "attempt_id and state_token are required" }, 400);

    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (profile.app_role !== "owner" && attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);

    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      solutionsRequested: attempt.solutions_requested,
    });
    if (state === "WAITING") return json({ error: "Content not available yet", state }, 403);
    if (attempt.delivery_mode === "seb_required") {
      return json({ error: "SEB validation is not implemented for MVP", state }, 501);
    }

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("id, normalized_package_json, normalized_package_path")
      .eq("id", attempt.assessment_version_id)
      .single();
    if (versionError) throw versionError;

    return json({
      attempt_id: attempt.id,
      state,
      package_version_id: version.id,
      rendering_mode: "normalized_html",
      assessment_package: version.normalized_package_json,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "get-attempt-package failed" }, 401);
  }
});
