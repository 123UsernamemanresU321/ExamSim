import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
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
    }>(request);
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
    if (state !== "ACTIVE" && state !== "UPLOAD_ONLY") return json({ error: "Upload confirmation not allowed in current state", state }, 403);
    const expectedPath = `attempts/${body.attempt_id}/${body.question_node_id}/current.pdf`;
    if (body.object_path !== expectedPath) return json({ error: "Invalid upload object path" }, 400);
    if (body.content_type && body.content_type !== "application/pdf") return json({ error: "Only PDF uploads are accepted" }, 400);
    if (typeof body.file_size_bytes !== "number" || body.file_size_bytes <= 0 || body.file_size_bytes > 10485760) {
      return json({ error: "PDF uploads must be 10MB or smaller" }, 400);
    }

    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("status,locked_at")
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", body.question_node_id)
      .single();
    if (slotError) throw slotError;
    if (slot.status === "uploaded" || slot.locked_at) return json({ error: "Upload slot already has a file" }, 409);

    const { error: updateError } = await admin
      .from("upload_slots")
      .update({
        object_path: body.object_path,
        uploaded_at: new Date().toISOString(),
        status: "uploaded",
        file_size_bytes: body.file_size_bytes,
        content_type: body.content_type ?? "application/pdf",
        confirmed_by_profile_id: profile.id,
        locked_at: new Date().toISOString(),
      })
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
    return errorResponse(error, "confirm-upload-slot failed");
  }
});
