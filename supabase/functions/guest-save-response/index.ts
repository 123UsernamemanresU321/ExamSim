import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { handleOptions, json, readJson, errorResponse } from "../_shared/http.ts";
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
      question_node_key?: string;
      answer_text?: string;
      state_token?: string;
    }>(request);
    if (!body.state_token || (!body.question_node_id && !body.question_node_key)) {
      return json(request, { error: "state_token and question node are required" }, 400);
    }
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const tokenPayload = await verifyStateToken(body.state_token);
    if (tokenPayload.attempt_id !== attempt.id || tokenPayload.profile_id !== `guest:${attempt.id}`) {
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
    if (state !== "ACTIVE" || !attempt.typed_enabled) return json(request, { error: "Text response not allowed", state }, 403);

    const admin = getAdminClient();
    const node = await resolveQuestionNode(admin, String(attempt.assessment_version_id), body.question_node_id, body.question_node_key);
    if (!node) return json(request, { error: "Question node does not belong to this attempt" }, 403);
    if (node.response_mode === "none" || node.response_mode === "upload_pdf") return json(request, { error: "Text response not allowed for this question" }, 403);

    const answerText = String(body.answer_text ?? "").slice(0, 50_000);
    const { error: upsertError } = await admin.from("text_responses").upsert({
      attempt_id: attempt.id,
      question_node_id: node.id,
      answer_text: answerText,
      saved_at: new Date().toISOString(),
    }, { onConflict: "attempt_id,question_node_id" });
    if (upsertError) throw upsertError;
    await admin.from("attempt_events").insert({
      attempt_id: attempt.id,
      event_type: "text.autosaved",
      payload_json: { question_node_id: node.id, question_node_key: node.node_key, actor: "guest" },
    });
    return json(request, { ok: true, state, question_node_id: node.id });
  } catch (error) {
    return errorResponse(request, error, "guest-save-response failed");
  }
});

async function resolveQuestionNode(
  admin: any,
  assessmentVersionId: string,
  questionNodeId?: string,
  questionNodeKey?: string,
) {
  const base = admin.from("question_nodes").select("id,node_key,response_mode").eq("assessment_version_id", assessmentVersionId);
  const { data, error } = await (questionNodeId ? base.eq("id", questionNodeId) : base.eq("node_key", questionNodeKey ?? "")).maybeSingle();
  if (error) throw error;
  return data;
}
