import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2, requireMarkerAssignment } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  annotation_id?: string | null;
  attempt_id: string;
  question_node_id: string;
  upload_slot_id?: string | null;
  text_response_id?: string | null;
  annotation_kind: "typed_text" | "uploaded_pdf" | "general";
  visibility?: "private" | "student_visible";
  severity?: "note" | "minor" | "major" | "critical";
  body?: string;
  anchor_json?: Record<string, unknown>;
  delete?: boolean;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const institution = await requireInstitutionAal2(request, "marking");
    const { user, admin, ownerProfileId } = institution;
    const body = await readJson<Body>(request);

    if (!body.attempt_id || !body.question_node_id) return json(request, { error: "attempt_id and question_node_id are required" }, 400);

    const context = await loadOwnedAttemptContext(admin, ownerProfileId, body.attempt_id, body.question_node_id);
    await requireMarkerAssignment(admin, institution, context.attempt.id);

    if (body.delete) {
      if (!body.annotation_id) return json(request, { error: "annotation_id is required for delete" }, 400);
      const { error } = await admin
        .from("work_annotations")
        .delete()
        .eq("id", body.annotation_id)
        .eq("attempt_id", context.attempt.id)
        .eq("owner_profile_id", ownerProfileId);
      if (error) throw error;
      await auditOwnerAction(ownerProfileId, user.id, "work_annotation.deleted", "attempts", context.attempt.id, {
        annotation_id: body.annotation_id,
        question_node_id: body.question_node_id,
      });
      return json(request, { ok: true, deleted: true });
    }

    const annotationBody = body.body?.trim();
    if (!annotationBody) return json(request, { error: "Annotation body is required" }, 400);
    if (!["typed_text", "uploaded_pdf", "general"].includes(body.annotation_kind)) return json(request, { error: "Invalid annotation_kind" }, 400);

    await validateOptionalSubmissionAnchors(admin, body);

    const payload = {
      attempt_id: context.attempt.id,
      question_node_id: body.question_node_id,
      upload_slot_id: body.upload_slot_id ?? null,
      text_response_id: body.text_response_id ?? null,
      owner_profile_id: ownerProfileId,
      annotation_kind: body.annotation_kind,
      visibility: body.visibility === "private" ? "private" : "student_visible",
      severity: normalizeSeverity(body.severity),
      body: annotationBody,
      anchor_json: body.anchor_json ?? {},
    };

    const query = body.annotation_id
      ? admin.from("work_annotations").update(payload).eq("id", body.annotation_id).eq("attempt_id", context.attempt.id).select("*").single()
      : admin.from("work_annotations").insert(payload).select("*").single();
    const { data: annotation, error } = await query;
    if (error) throw error;

    await auditOwnerAction(ownerProfileId, user.id, "work_annotation.saved", "attempts", context.attempt.id, {
      annotation_id: annotation.id,
      question_node_id: body.question_node_id,
      annotation_kind: body.annotation_kind,
      visibility: payload.visibility,
    });

    return json(request, { ok: true, annotation });
  } catch (error) {
    return errorResponse(request, error, "save-work-annotation failed");
  }
});

async function loadOwnedAttemptContext(admin: any, ownerProfileId: string, attemptId: string, questionNodeId: string) {
  const { data: attempt, error: attemptError } = await admin
    .from("attempts")
    .select("id, assessment_id, assessment_version_id")
    .eq("id", attemptId)
    .single();
  if (attemptError) throw attemptError;

  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("owner_profile_id")
    .eq("id", attempt.assessment_id)
    .single();
  if (assessmentError) throw assessmentError;
  if (assessment.owner_profile_id !== ownerProfileId) throw new Error("Forbidden");

  const { data: node, error: nodeError } = await admin
    .from("question_nodes")
    .select("id")
    .eq("id", questionNodeId)
    .eq("assessment_version_id", attempt.assessment_version_id)
    .single();
  if (nodeError) throw nodeError;
  if (!node?.id) throw new Error("Question node not found");

  return { attempt };
}

async function validateOptionalSubmissionAnchors(admin: any, body: Body) {
  if (body.upload_slot_id) {
    const { data, error } = await admin
      .from("upload_slots")
      .select("id")
      .eq("id", body.upload_slot_id)
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", body.question_node_id)
      .single();
    if (error) throw error;
    if (!data?.id) throw new Error("Upload slot does not match this attempt and question");
  }

  if (body.text_response_id) {
    const { data, error } = await admin
      .from("text_responses")
      .select("id")
      .eq("id", body.text_response_id)
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", body.question_node_id)
      .single();
    if (error) throw error;
    if (!data?.id) throw new Error("Text response does not match this attempt and question");
  }
}

function normalizeSeverity(value: unknown) {
  return ["note", "minor", "major", "critical"].includes(String(value)) ? String(value) : "note";
}
