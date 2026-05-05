import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    if (profile.app_role !== "student") return json({ error: "Student role required" }, 403);
    const body = await readJson<{ attempt_id: string; device_id?: string }>(request);
    const { data: attempt, error } = await admin.from("attempts").select("id, assignee_profile_id").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);
    const { data: session, error: sessionError } = await admin
      .from("attempt_sessions")
      .insert({
        attempt_id: body.attempt_id,
        device_id_hash: body.device_id ? await sha256Hex(body.device_id) : null,
        user_agent_hash: await sha256Hex(request.headers.get("user-agent") ?? ""),
        ip_hash: await sha256Hex(request.headers.get("x-forwarded-for") ?? ""),
      })
      .select("id")
      .single();
    if (sessionError) throw sessionError;
    return json({ attempt_session_id: session.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "start-attempt-session failed" }, 401);
  }
});
