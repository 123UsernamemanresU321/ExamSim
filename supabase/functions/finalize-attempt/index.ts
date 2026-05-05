import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string; state_token: string }>(request);
    const { data: attempt, error } = await admin.from("attempts").select("assignee_profile_id").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);
    await admin.from("text_responses").update({ finalized_at: new Date().toISOString() }).eq("attempt_id", body.attempt_id);
    await admin.from("upload_slots").update({ status: "missing" }).eq("attempt_id", body.attempt_id).eq("status", "pending");
    await admin.rpc("generate_moderation_summary", { target_attempt_id: body.attempt_id });
    await admin.from("attempt_events").insert({ attempt_id: body.attempt_id, event_type: "attempt.finalized", payload_json: {} });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "finalize-attempt failed" }, 401);
  }
});
