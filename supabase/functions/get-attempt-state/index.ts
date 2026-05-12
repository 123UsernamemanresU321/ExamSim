import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState, getCountdownTarget } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { signStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body: { attempt_id?: string; attempt_session_id?: string } =
      request.method === "GET" ? {} : await readJson<{ attempt_id?: string; attempt_session_id?: string }>(request);
    const attemptId =
      request.method === "GET"
        ? new URL(request.url).searchParams.get("attempt_id")
        : body.attempt_id;
    if (!attemptId) return json({ error: "attempt_id is required" }, 400);

    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", attemptId).single();
    if (error) throw error;
    const isOwner = profile.app_role === "owner";
    if (!isOwner && attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);
    const attemptSessionId = typeof body.attempt_session_id === "string" ? body.attempt_session_id : undefined;
    if (attemptSessionId) {
      const { data: session, error: sessionError } = await admin
        .from("attempt_sessions")
        .select("id, attempt_id")
        .eq("id", attemptSessionId)
        .eq("attempt_id", attempt.id)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) return json({ error: "Attempt session does not match this attempt" }, 403);
    }

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
      attempt_session_id: attemptSessionId,
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
    return errorResponse(error, "get-attempt-state failed");
  }
});
