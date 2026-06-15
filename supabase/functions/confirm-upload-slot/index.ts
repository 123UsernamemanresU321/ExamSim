import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { verifyAnswerUploadPdf } from "../_shared/pdf-upload.ts";
import { verifyStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{
      attempt_id: string;
      question_node_id: string;
      object_path: string;
      state_token: string;
      file_size_bytes?: number;
      content_type?: string;
      file_name?: string;
    }>(request);
    const tokenPayload = await verifyStateToken(body.state_token);
    if (tokenPayload.attempt_id !== body.attempt_id || tokenPayload.profile_id !== profile.id) {
      return json(request, { error: "State token does not match this attempt" }, 403);
    }
    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (attempt.assignee_profile_id !== profile.id) return json(request, { error: "Forbidden" }, 403);
    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      solutionsRequested: attempt.solutions_requested,
    });
    if (state !== "ACTIVE" && state !== "UPLOAD_ONLY") return json(request, { error: "Upload confirmation not allowed in current state", state }, 403);
    const expectedPath = `attempts/${body.attempt_id}/${body.question_node_id}/current.pdf`;
    if (body.object_path !== expectedPath) return json(request, { error: "Invalid upload object path" }, 400);
    const originalFileName = sanitizeOriginalFileName(body.file_name);

    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("status,locked_at")
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", body.question_node_id)
      .single();
    if (slotError) throw slotError;
    if (slot.status === "uploaded" || slot.locked_at) return json(request, { error: "Upload slot already has a file" }, 409);

    const verified = await verifyAnswerUploadPdf(admin, body.object_path);

    const { error: updateError } = await admin
      .from("upload_slots")
      .update({
        object_path: body.object_path,
        uploaded_at: new Date().toISOString(),
        status: "uploaded",
        original_file_name: originalFileName,
        file_size_bytes: verified.byteLength,
        content_type: verified.contentType,
        confirmed_by_profile_id: profile.id,
        locked_at: new Date().toISOString(),
      })
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", body.question_node_id);
    if (updateError) throw updateError;
    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: "upload.completed",
      payload_json: {
        question_node_id: body.question_node_id,
        object_path: body.object_path,
        file_name: originalFileName,
        file_size_bytes: verified.byteLength,
        page_count: verified.pageCount,
      },
    });
    return json(request, { ok: true, file_size_bytes: verified.byteLength, content_type: verified.contentType, page_count: verified.pageCount });
  } catch (error) {
    return errorResponse(request, error, "confirm-upload-slot failed");
  }
});

function sanitizeOriginalFileName(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 255);
}
