import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string; question_node_id: string; state_token: string }>(request);
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
    if (state !== "ACTIVE" && state !== "UPLOAD_ONLY") return json({ error: "Upload not allowed in current state", state }, 403);
    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("*")
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", body.question_node_id)
      .single();
    if (slotError) throw slotError;
    if (slot.status === "uploaded") return json({ error: "Upload slot already has a file" }, 409);
    const path = `attempts/${body.attempt_id}/${body.question_node_id}/current.pdf`;
    const { data, error: signedError } = await admin.storage.from("answer-uploads").createSignedUploadUrl(path);
    if (signedError) throw signedError;
    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: "upload.url_requested",
      payload_json: { question_node_id: body.question_node_id, path },
    });
    return json({
      attempt_id: body.attempt_id,
      question_node_id: body.question_node_id,
      bucket: "answer-uploads",
      path,
      signed_upload_url: data.signedUrl,
      signed_upload_url_validity: "2h_platform_limit",
      slot_status: slot.status,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "issue-upload-slot-url failed" }, 401);
  }
});
