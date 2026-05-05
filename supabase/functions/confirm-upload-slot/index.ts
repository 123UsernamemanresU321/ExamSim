import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string; question_node_id: string; object_path: string; state_token: string }>(request);
    const { data: attempt, error } = await admin.from("attempts").select("assignee_profile_id").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);
    const { error: updateError } = await admin
      .from("upload_slots")
      .update({ object_path: body.object_path, uploaded_at: new Date().toISOString(), status: "uploaded" })
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", body.question_node_id);
    if (updateError) throw updateError;
    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: "upload.completed",
      payload_json: { question_node_id: body.question_node_id, object_path: body.object_path },
    });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "confirm-upload-slot failed" }, 401);
  }
});
