import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
import { verifyStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string; question_node_id: string; answer_text: string; state_token: string }>(request);
    const tokenPayload = await verifyStateToken(body.state_token);
    if (tokenPayload.attempt_id !== body.attempt_id || tokenPayload.profile_id !== profile.id) {
      return json({ error: "State token does not match this attempt" }, 403);
    }
    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);
    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      solutionsRequested: attempt.solutions_requested,
    });
    if (state !== "ACTIVE" || !attempt.typed_enabled) return json({ error: "Text response not allowed", state }, 403);
    const { error: upsertError } = await admin.from("text_responses").upsert({
      attempt_id: body.attempt_id,
      question_node_id: body.question_node_id,
      answer_text: body.answer_text ?? "",
      saved_at: new Date().toISOString(),
    }, { onConflict: "attempt_id,question_node_id" });
    if (upsertError) throw upsertError;
    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: "text.autosaved",
      payload_json: { question_node_id: body.question_node_id },
    });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "save-text-response failed" }, 401);
  }
});
