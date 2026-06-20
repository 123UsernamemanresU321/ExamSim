import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { verifyAnswerUploadPdf } from "../_shared/pdf-upload.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { verifyStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{
      guest_token?: string;
      attempt_id?: string;
      question_node_id?: string;
      object_path?: string;
      state_token?: string;
      file_name?: string;
    }>(request);
    if (!body.state_token) return json(request, { error: "state_token is required" }, 400);
    if (!body.question_node_id || !body.object_path) return json(request, { error: "question_node_id and object_path are required" }, 400);
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const statePayload = await verifyStateToken(body.state_token);
    if (statePayload.attempt_id !== attempt.id || statePayload.profile_id !== `guest:${attempt.id}`) {
      return json(request, { error: "State token does not match this guest attempt" }, 403);
    }
    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: String(attempt.start_at_utc),
      endAtUtc: String(attempt.end_at_utc),
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc ? String(attempt.upload_deadline_at_utc) : null,
      pausedAtUtc: attempt.paused_at ? String(attempt.paused_at) : null,
      solutionsRequested: Boolean(attempt.solutions_requested),
    });
    if (state !== "ACTIVE" && state !== "UPLOAD_ONLY") return json(request, { error: "Upload confirmation not allowed in current state", state }, 403);

    const expectedPath = `attempts/${attempt.id}/${body.question_node_id}/current.pdf`;
    if (body.object_path !== expectedPath) return json(request, { error: "Invalid upload object path" }, 400);
    const admin = getAdminClient();
    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("status,locked_at")
      .eq("attempt_id", attempt.id)
      .eq("question_node_id", body.question_node_id)
      .single();
    if (slotError) throw slotError;
    if (slot.status === "uploaded" || slot.locked_at) return json(request, { error: "Upload slot already has a file" }, 409);

    const verified = await verifyAnswerUploadPdf(admin, body.object_path);
    const originalFileName = sanitizeOriginalFileName(body.file_name);
    const lockedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("upload_slots")
      .update({
        object_path: body.object_path,
        uploaded_at: lockedAt,
        status: "uploaded",
        original_file_name: originalFileName,
        file_size_bytes: verified.byteLength,
        content_type: verified.contentType,
        confirmed_by_profile_id: null,
        locked_at: lockedAt,
      })
      .eq("attempt_id", attempt.id)
      .eq("question_node_id", body.question_node_id);
    if (updateError) throw updateError;
    await admin.from("attempt_events").insert({
      attempt_id: attempt.id,
      event_type: "upload.completed",
      payload_json: {
        actor: "guest",
        question_node_id: body.question_node_id,
        object_path: body.object_path,
        file_name: originalFileName,
        file_size_bytes: verified.byteLength,
        page_count: verified.pageCount,
      },
    });
    return json(request, {
      ok: true,
      file_size_bytes: verified.byteLength,
      content_type: verified.contentType,
      page_count: verified.pageCount,
      locked_at: lockedAt,
    });
  } catch (error) {
    return errorResponse(request, error, "guest-confirm-upload-slot failed");
  }
});

function sanitizeOriginalFileName(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 255);
}
