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
    const body = await readJson<{ attempt_id: string; question_node_id?: string; question_node_key?: string; state_token: string }>(request);
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
    if (state !== "ACTIVE" && state !== "UPLOAD_ONLY") return json({ error: "Upload not allowed in current state", state }, 403);
    if (state === "ACTIVE" && !attempt.per_question_upload_enabled) {
      return json({ error: "Uploads are not enabled during writing time" }, 403);
    }
    let resolvedQuestionNodeId = body.question_node_id ?? null;
    if (body.question_node_key) {
      const { data: node, error: nodeError } = await admin
        .from("question_nodes")
        .select("id")
        .eq("assessment_version_id", attempt.assessment_version_id)
        .eq("node_key", body.question_node_key)
        .maybeSingle();
      if (nodeError) throw nodeError;
      resolvedQuestionNodeId = node?.id ?? resolvedQuestionNodeId;
    }
    if (!resolvedQuestionNodeId) return json({ error: "question_node_id or question_node_key is required" }, 400);

    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("*")
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", resolvedQuestionNodeId)
      .single();
    if (slotError) throw slotError;
    if (slot.status === "uploaded" || slot.locked_at) return json({ error: "Upload slot already has a file" }, 409);
    const path = `attempts/${body.attempt_id}/${resolvedQuestionNodeId}/current.pdf`;
    const { data, error: signedError } = await admin.storage.from("answer-uploads").createSignedUploadUrl(path);
    if (signedError) throw signedError;
    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: "upload.url_requested",
      payload_json: { question_node_id: resolvedQuestionNodeId, question_node_key: body.question_node_key ?? null, path },
    });
    return json({
      attempt_id: body.attempt_id,
      upload_slot_id: slot.id,
      question_node_id: resolvedQuestionNodeId,
      bucket: "answer-uploads",
      path,
      signed_upload_url: data.signedUrl,
      upload_token: data.token,
      max_file_size_bytes: 10485760,
      accepted_content_type: "application/pdf",
      signed_upload_url_validity: "2h_platform_limit",
      slot_status: slot.status,
    });
  } catch (error) {
    return errorResponse(error, "issue-upload-slot-url failed");
  }
});
