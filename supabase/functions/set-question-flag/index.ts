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
      question_node_id?: string;
      question_node_key?: string;
      flagged: boolean;
      state_token: string;
      note?: string;
    }>(request);
    if (!body.attempt_id || (!body.question_node_id && !body.question_node_key) || !body.state_token) {
      return json({ error: "attempt_id, question_node_id or question_node_key, and state_token are required" }, 400);
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

    const node = await resolveQuestionNodeForAttempt(admin, attempt.assessment_version_id, body.question_node_id, body.question_node_key);
    if (!node) return json({ error: "Question node does not belong to this attempt" }, 403);

    await admin
      .from("submission_annotations")
      .delete()
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", node.id)
      .eq("annotation_type", "student_flag");

    const ownerProfileId = attempt.assessments?.owner_profile_id;
    if (!ownerProfileId) throw new Error("Assessment owner not found");
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const { error: annotationError } = await admin.from("submission_annotations").insert({
      attempt_id: body.attempt_id,
      question_node_id: node.id,
      owner_profile_id: ownerProfileId,
      annotation_type: "student_flag",
      body: body.flagged ? (note || "flagged") : "unflagged",
      anchor_json: body.flagged && note ? { note } : {},
    });
    if (annotationError) throw annotationError;

    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: body.flagged ? "question.flagged" : "question.unflagged",
      payload_json: { question_node_id: node.id, question_node_key: node.node_key, has_note: Boolean(note) },
    });

    return json({ ok: true, flagged: body.flagged, question_node_id: node.id, question_node_key: node.node_key });
  } catch (error) {
    return errorResponse(error, "set-question-flag failed");
  }
});

async function resolveQuestionNodeForAttempt(
  admin: {
    from(table: "question_nodes"): {
      select(columns: string): {
        eq(column: string, value: string): {
          eq(column: string, value: string): {
            maybeSingle(): Promise<{ data: { id: string; node_key: string } | null; error: Error | null }>;
          };
        };
      };
    };
  },
  assessmentVersionId: string,
  questionNodeId?: string,
  questionNodeKey?: string,
) {
  const keyCandidate = questionNodeKey ?? (questionNodeId && !isUuid(questionNodeId) ? questionNodeId : null);
  const baseQuery = admin
    .from("question_nodes")
    .select("id,node_key")
    .eq("assessment_version_id", assessmentVersionId);
  const query = isUuid(questionNodeId ?? "") ? baseQuery.eq("id", questionNodeId!) : baseQuery.eq("node_key", keyCandidate ?? "");
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
