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
      answer_text: string;
      state_token: string;
    }>(request);
    if (!body.attempt_id || (!body.question_node_id && !body.question_node_key) || !body.state_token) {
      return json({ error: "attempt_id, question_node_id or question_node_key, and state_token are required" }, 400);
    }
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
      pausedAtUtc: attempt.paused_at,
      solutionsRequested: attempt.solutions_requested,
    });
    if (state !== "ACTIVE" || !attempt.typed_enabled) return json({ error: "Text response not allowed", state }, 403);
    const node = await resolveQuestionNodeForAttempt(admin, attempt.assessment_version_id, body.question_node_id, body.question_node_key);
    if (!node) return json({ error: "Question node does not belong to this attempt" }, 403);

    const answerText = validateAnswerText(body.answer_text ?? "", node.response_mode, node.interaction_json);
    const { error: upsertError } = await admin.from("text_responses").upsert({
      attempt_id: body.attempt_id,
      question_node_id: node.id,
      answer_text: answerText,
      saved_at: new Date().toISOString(),
    }, { onConflict: "attempt_id,question_node_id" });
    if (upsertError) throw upsertError;
    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: "text.autosaved",
      payload_json: {
        question_node_id: node.id,
        question_node_key: node.node_key,
        response_mode: node.response_mode,
      },
    });
    return json({ ok: true, question_node_id: node.id, question_node_key: node.node_key });
  } catch (error) {
    return errorResponse(error, "save-text-response failed");
  }
});

async function resolveQuestionNodeForAttempt(
  admin: {
    from(table: "question_nodes"): {
      select(columns: string): {
        eq(column: string, value: string): {
          eq(column: string, value: string): {
            maybeSingle(): Promise<{
              data: { id: string; node_key: string; response_mode: string; interaction_json: unknown } | null;
              error: Error | null;
            }>;
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
    .select("id,node_key,response_mode,interaction_json")
    .eq("assessment_version_id", assessmentVersionId);

  const query = isUuid(questionNodeId ?? "") ? baseQuery.eq("id", questionNodeId!) : baseQuery.eq("node_key", keyCandidate ?? "");
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

function validateAnswerText(answerText: string, responseMode: string, interactionJson: unknown) {
  if (responseMode === "none" || responseMode === "upload_pdf") {
    throw new Error("Text response not allowed for this question");
  }
  if (responseMode === "multiple_choice") return validateChoiceAnswer(answerText, interactionJson);
  if (responseMode === "numerical") return validateNumericalAnswer(answerText, interactionJson);
  return String(answerText ?? "");
}

function validateChoiceAnswer(answerText: string, interactionJson: unknown) {
  const parsed = parseRecord(answerText);
  const kind = stringValue(parsed.kind);
  if (kind !== "multiple_choice" && kind !== "choice") {
    throw new Error("Multiple-choice answers must include kind multiple_choice");
  }

  const rawIds = Array.isArray(parsed.choice_ids)
    ? parsed.choice_ids
    : Array.isArray(parsed.choiceIds)
      ? parsed.choiceIds
      : [];
  const uniqueIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
  const interaction = isRecord(interactionJson) ? interactionJson : {};
  const maxChoices = Math.max(1, numberValue(interaction.max_choices) ?? 1);
  if (uniqueIds.length > maxChoices) throw new Error(`Select no more than ${maxChoices} choice${maxChoices === 1 ? "" : "s"}`);

  const allowedChoices = Array.isArray(interaction.choices)
    ? new Set(
        interaction.choices
          .map((choice) => isRecord(choice) ? stringValue(choice.choice_id) ?? stringValue(choice.id) : null)
          .filter((id): id is string => Boolean(id)),
      )
    : null;
  if (allowedChoices?.size && uniqueIds.some((id) => !allowedChoices.has(id))) {
    throw new Error("Selected choice is not valid for this question");
  }

  return JSON.stringify({ kind: "multiple_choice", choice_ids: uniqueIds });
}

function validateNumericalAnswer(answerText: string, interactionJson: unknown) {
  const parsed = parseRecord(answerText);
  const value = stringValue(parsed.value) ?? (typeof parsed.value === "number" ? String(parsed.value) : answerText);
  const trimmed = value.trim();
  if (trimmed) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) throw new Error("Numerical answers must be valid numbers");
    const interaction = isRecord(interactionJson) ? interactionJson : {};
    const min = numberValue(interaction.min_value);
    const max = numberValue(interaction.max_value);
    if (min !== null && numeric < min) throw new Error(`Numerical answer must be at least ${min}`);
    if (max !== null && numeric > max) throw new Error(`Numerical answer must be no more than ${max}`);
  }
  return JSON.stringify({ kind: "numerical", value: trimmed });
}

function parseRecord(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
