import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id?: string; message_id?: string }>(request);
    const attemptId = String(body.attempt_id ?? "").trim();
    const messageId = String(body.message_id ?? "").trim();
    if (!attemptId || !messageId) return json(request, { error: "attempt_id and message_id are required" }, 400);
    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id,assignee_profile_id,exam_session_id")
      .eq("id", attemptId)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt || attempt.assignee_profile_id !== profile.id || !attempt.exam_session_id) {
      return json(request, { error: "Forbidden" }, 403);
    }
    const { data: message, error: messageError } = await admin
      .from("invigilation_messages")
      .select("id,attempt_id,message_kind,visible_to_student")
      .eq("id", messageId)
      .eq("exam_session_id", attempt.exam_session_id)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message || !message.visible_to_student || (message.message_kind !== "broadcast" && message.attempt_id !== attempt.id)) {
      return json(request, { error: "Message not found" }, 404);
    }
    const acknowledgedAt = new Date().toISOString();
    const { error } = await admin.from("invigilation_message_receipts").upsert({
      message_id: messageId,
      attempt_id: attempt.id,
      acknowledged_at: acknowledgedAt,
    }, { onConflict: "message_id,attempt_id" });
    if (error) throw error;
    return json(request, { ok: true, acknowledged_at: acknowledgedAt });
  } catch (error) {
    return errorResponse(request, error, "authenticated acknowledgement failed");
  }
});
