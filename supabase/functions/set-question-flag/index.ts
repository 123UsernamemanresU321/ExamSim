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
      flagged: boolean;
      state_token: string;
    }>(request);
    if (!body.attempt_id || !body.question_node_id || !body.state_token) {
      return json({ error: "attempt_id, question_node_id, and state_token are required" }, 400);
    }

    const tokenPayload = await verifyStateToken(body.state_token);
    if (tokenPayload.attempt_id !== body.attempt_id || tokenPayload.profile_id !== profile.id) {
      return json({ error: "State token does not match this attempt" }, 403);
    }

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("*, assessments(owner_profile_id)")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    if (attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);

    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      solutionsRequested: attempt.solutions_requested,
    });
    if (state !== "ACTIVE") return json({ error: "Question flags can only be changed while writing is active", state }, 403);

    const { data: node, error: nodeError } = await admin
      .from("question_nodes")
      .select("id")
      .eq("id", body.question_node_id)
      .eq("assessment_version_id", attempt.assessment_version_id)
      .maybeSingle();
    if (nodeError) throw nodeError;
    if (!node) return json({ error: "Question node does not belong to this attempt" }, 403);

    await admin
      .from("submission_annotations")
      .delete()
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", body.question_node_id)
      .eq("annotation_type", "student_flag");

    const ownerProfileId = attempt.assessments?.owner_profile_id;
    if (!ownerProfileId) throw new Error("Assessment owner not found");
    const { error: annotationError } = await admin.from("submission_annotations").insert({
      attempt_id: body.attempt_id,
      question_node_id: body.question_node_id,
      owner_profile_id: ownerProfileId,
      annotation_type: "student_flag",
      body: body.flagged ? "flagged" : "unflagged",
      anchor_json: {},
    });
    if (annotationError) throw annotationError;

    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: body.flagged ? "question.flagged" : "question.unflagged",
      payload_json: { question_node_id: body.question_node_id },
    });

    return json({ ok: true, flagged: body.flagged });
  } catch (error) {
    return errorResponse(error, "set-question-flag failed");
  }
});
