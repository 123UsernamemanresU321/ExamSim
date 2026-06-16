import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { handleOptions, json, readJson, errorResponse } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabase.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{ guest_token?: string; attempt_id?: string; message?: string; kind?: "private" | "technical_issue" }>(request);
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const message = String(body.message ?? "").trim().slice(0, 2000);
    if (!message) return json(request, { error: "Message is required" }, 400);
    if (!attempt.exam_session_id) return json(request, { error: "Attempt is not attached to an exam session" }, 400);
    const admin = getAdminClient();
    const { error } = await admin.from("invigilation_messages").insert({
      exam_session_id: attempt.exam_session_id,
      attempt_id: attempt.id,
      sender_kind: "student_guest",
      message_kind: body.kind === "technical_issue" ? "technical_issue" : "private",
      body: message,
      visible_to_student: true,
    });
    if (error) throw error;
    return json(request, { ok: true });
  } catch (error) {
    return errorResponse(request, error, "guest-send-invigilation-message failed");
  }
});
