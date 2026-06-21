import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabase.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{ guest_token?: string; attempt_id?: string; message_id?: string }>(request);
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const messageId = String(body.message_id ?? "").trim();
    if (!messageId) return json(request, { error: "message_id is required" }, 400);
    const admin = getAdminClient();
    await requireVisibleMessage(admin, messageId, String(attempt.exam_session_id ?? ""), String(attempt.id));
    const acknowledgedAt = new Date().toISOString();
    const { error } = await admin.from("invigilation_message_receipts").upsert({
      message_id: messageId,
      attempt_id: attempt.id,
      acknowledged_at: acknowledgedAt,
    }, { onConflict: "message_id,attempt_id" });
    if (error) throw error;
    return json(request, { ok: true, acknowledged_at: acknowledgedAt });
  } catch (error) {
    return errorResponse(request, error, "guest acknowledgement failed");
  }
});

async function requireVisibleMessage(admin: any, messageId: string, examSessionId: string, attemptId: string) {
  if (!examSessionId) throw new Error("Attempt is not attached to an exam session");
  const { data: message, error } = await admin
    .from("invigilation_messages")
    .select("id,attempt_id,message_kind,visible_to_student")
    .eq("id", messageId)
    .eq("exam_session_id", examSessionId)
    .maybeSingle();
  if (error) throw error;
  if (!message || !message.visible_to_student) throw new Error("Message not found");
  if (message.message_kind !== "broadcast" && message.attempt_id !== attemptId) throw new Error("Message not found");
}
