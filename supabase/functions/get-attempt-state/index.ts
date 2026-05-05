import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState, getCountdownTarget } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
import { signStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const attemptId =
      request.method === "GET"
        ? new URL(request.url).searchParams.get("attempt_id")
        : (await readJson<{ attempt_id: string }>(request)).attempt_id;
    if (!attemptId) return json({ error: "attempt_id is required" }, 400);

    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", attemptId).single();
    if (error) throw error;
    const isOwner = profile.app_role === "owner";
    if (!isOwner && attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);

    const serverNowUtc = new Date().toISOString();
    const state = computeAttemptState({
      serverNowUtc,
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      solutionsRequested: attempt.solutions_requested,
    });
    const stateToken = await signStateToken({
      token_id: crypto.randomUUID(),
      attempt_id: attempt.id,
      profile_id: profile.id,
      computed_state: state,
      server_now_utc: serverNowUtc,
      expires_at_utc: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      delivery_mode: attempt.delivery_mode,
      seb_verified: false,
    });

    return json({
      attempt_id: attempt.id,
      state,
      server_now_utc: serverNowUtc,
      display_timezone: attempt.display_timezone,
      countdown_target_utc: getCountdownTarget(state, attempt),
      delivery_mode: attempt.delivery_mode,
      solutions_requested: attempt.solutions_requested,
      moderation_policy: {
        mode: "browser",
        language: "Browser Mode records moderation signals; it is tamper-evident, not tamper-proof.",
      },
      state_token: stateToken,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "get-attempt-state failed" }, 401);
  }
});
