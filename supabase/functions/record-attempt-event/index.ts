import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{
      attempt_id: string;
      attempt_session_id?: string;
      event_type: string;
      client_event_at?: string;
      client_seq?: number;
      payload?: Record<string, unknown>;
      state_token?: string;
    }>(request);
    if (!body.attempt_id || !body.event_type) return json({ error: "attempt_id and event_type are required" }, 400);

    const { data: attempt, error } = await admin.from("attempts").select("id, assignee_profile_id").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (profile.app_role !== "owner" && attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);
    if (body.attempt_session_id) {
      const { data: session, error: sessionError } = await admin
        .from("attempt_sessions")
        .select("id")
        .eq("id", body.attempt_session_id)
        .eq("attempt_id", attempt.id)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) return json({ error: "Attempt session does not match this attempt" }, 403);
    }

    const { error: insertError } = await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      attempt_session_id: body.attempt_session_id ?? null,
      event_type: body.event_type,
      client_event_at: body.client_event_at ?? null,
      client_seq: body.client_seq ?? null,
      payload_json: body.payload ?? {},
      state_token_id: body.state_token ? body.state_token.slice(0, 24) : null,
    });
    if (insertError) throw insertError;
    if (body.attempt_session_id && body.event_type === "heartbeat") {
      await admin
        .from("attempt_sessions")
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq("id", body.attempt_session_id)
        .eq("attempt_id", attempt.id);
    }
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error, "record-attempt-event failed");
  }
});
