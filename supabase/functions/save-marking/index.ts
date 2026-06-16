import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  attempt_id: string;
  marks?: {
    question_node_id?: string | null;
    rubric_criteria_id?: string | null;
    awarded_marks: number;
    notes?: string | null;
  }[];
  rubric_awards?: {
    question_node_id: string;
    rubric_criteria_id?: string | null;
    rubric_template_item_id?: string | null;
    awarded_marks: number;
    selected?: boolean;
    feedback_text?: string | null;
  }[];
  rubric_award_node_ids?: string[];
  annotations?: {
    question_node_id?: string | null;
    annotation_type: "note" | "rubric" | "moderation" | "feedback" | "student_flag" | "marker_flag";
    body: string;
    anchor_json?: Record<string, unknown>;
  }[];
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.attempt_id) return json({ error: "attempt_id is required" }, 400);

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id,assessment_version_id")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;

    const markRows = (body.marks ?? []).map((mark) => {
      if (!Number.isFinite(mark.awarded_marks) || mark.awarded_marks < 0) {
        throw new Error("awarded_marks must be zero or greater");
      }
      return {
        attempt_id: attempt.id,
        question_node_id: mark.question_node_id ?? null,
        rubric_criteria_id: mark.rubric_criteria_id ?? null,
        marker_profile_id: ownerProfile.id,
        awarded_marks: mark.awarded_marks,
        notes: mark.notes ?? null,
      };
    });
    const rubricRows = markRows.filter((row) => row.rubric_criteria_id);
    const genericRows = markRows.filter((row) => !row.rubric_criteria_id);
    await validateStructuredMarkRows(admin, attempt.assessment_version_id, genericRows);
    const rubricAwardRows = await buildRubricAwardRows(admin, attempt.assessment_version_id, attempt.id, ownerProfile.id, body.rubric_awards ?? []);
    const explicitRubricAwardNodeIds = await validateRubricAwardNodeIds(
      admin,
      attempt.assessment_version_id,
      body.rubric_award_node_ids ?? [],
    );
    
    if (rubricRows.length > 0) {
      const { error: marksError } = await admin.from("marks").upsert(rubricRows, {
        onConflict: "attempt_id,rubric_criteria_id",
      });
      if (marksError) throw marksError;
    }

    const rubricAwardNodeIds = [...new Set([
      ...rubricAwardRows.map((row) => row.question_node_id),
      ...explicitRubricAwardNodeIds,
    ])];
    if (rubricAwardNodeIds.length > 0) {
      const { error: deleteRubricAwardError } = await admin
        .from("rubric_item_awards")
        .delete()
        .eq("attempt_id", attempt.id)
        .in("question_node_id", rubricAwardNodeIds);
      if (deleteRubricAwardError) throw deleteRubricAwardError;

      if (rubricAwardRows.length > 0) {
        const { error: insertRubricAwardError } = await admin
          .from("rubric_item_awards")
          .insert(rubricAwardRows);
        if (insertRubricAwardError) throw insertRubricAwardError;
      }
    }

    // Only delete generic marks for the specific nodes being updated in this request.
    const genericNodeIds = [...new Set(genericRows.map(r => r.question_node_id).filter(Boolean))];
    if (genericNodeIds.length > 0) {
      const { error: deleteError } = await admin
        .from("marks")
        .delete()
        .eq("attempt_id", attempt.id)
        .in("question_node_id", genericNodeIds)
        .is("rubric_criteria_id", null);
      if (deleteError) throw deleteError;
    }

    if (genericRows.length > 0) {
      const { error: marksError } = await admin.from("marks").insert(genericRows);
      if (marksError) throw marksError;
    }

    const annotationRows = (body.annotations ?? [])
      .filter((annotation) => annotation.body.trim())
      .map((annotation) => ({
        attempt_id: attempt.id,
        question_node_id: annotation.question_node_id ?? null,
        owner_profile_id: ownerProfile.id,
        annotation_type: annotation.annotation_type,
        body: annotation.body.trim(),
        anchor_json: annotation.anchor_json ?? {},
      }));

    // Delete existing annotations for the specific nodes being updated (incremental, like marks)
    const annotationNodeIds = [...new Set(
      (body.annotations ?? []).map(a => a.question_node_id).filter(Boolean)
    )];
    if (annotationNodeIds.length > 0) {
      const { error: deleteAnnotationError } = await admin
        .from("submission_annotations")
        .delete()
        .eq("attempt_id", attempt.id)
        .in("question_node_id", annotationNodeIds)
        .in("annotation_type", ["note", "rubric", "feedback", "marker_flag"]); // Do NOT delete student_flag
      if (deleteAnnotationError) throw deleteAnnotationError;
    }

    if (annotationRows.length > 0) {
      const { error: annotationError } = await admin.from("submission_annotations").insert(annotationRows);
      if (annotationError) throw annotationError;
    }

    await auditOwnerAction(ownerProfile.id, user.id, "marking.saved", "attempts", attempt.id, {
      mark_count: markRows.length,
      rubric_award_count: rubricAwardRows.length,
      annotation_count: annotationRows.length,
    });

    return json({ ok: true, mark_count: markRows.length, rubric_award_count: rubricAwardRows.length, annotation_count: annotationRows.length });
  } catch (error) {
    return errorResponse(error, "save-marking failed");
  }
});

async function validateStructuredMarkRows(
  admin: any,
  assessmentVersionId: string,
  markRows: { question_node_id: string | null; awarded_marks: number }[],
) {
  const nodeIds = [...new Set(markRows.map((row) => row.question_node_id).filter((id): id is string => Boolean(id)))];
  if (!nodeIds.length) return;

  const { data, error } = await admin
    .from("question_nodes")
    .select("id,response_mode,marks")
    .eq("assessment_version_id", assessmentVersionId)
    .in("id", nodeIds);
  if (error) throw error;

  const { data: children, error: childrenError } = await admin
    .from("question_nodes")
    .select("parent_node_id")
    .eq("assessment_version_id", assessmentVersionId)
    .in("parent_node_id", nodeIds);
  if (childrenError) throw childrenError;

  const parentIdsWithChildren = new Set(
    (children ?? [])
      .map((child: { parent_node_id?: string | null }) => child.parent_node_id)
      .filter((id: string | null | undefined): id is string => Boolean(id)),
  );

  const nodeById = new Map((data ?? []).map((node: { id: string }) => [node.id, node]));
  for (const row of markRows) {
    if (!row.question_node_id) continue;
    const node = nodeById.get(row.question_node_id) as { response_mode?: string; marks?: number | null } | undefined;
    if (!node) throw new Error("Question node not found for marking");
    if (parentIdsWithChildren.has(row.question_node_id)) {
      throw new Error("Parent question marks are derived from child question marks");
    }
    if (node.response_mode !== "multiple_choice" && node.response_mode !== "numerical") continue;

    const maxMarks = Number(node.marks ?? 0);
    if (row.awarded_marks !== 0 && row.awarded_marks !== maxMarks) {
      throw new Error("Numerical and multiple-choice questions must be marked correct or incorrect");
    }
  }
}

async function validateRubricAwardNodeIds(admin: any, assessmentVersionId: string, nodeIds: string[]) {
  const uniqueNodeIds = [...new Set(nodeIds.filter((id) => typeof id === "string" && id.trim()))];
  if (!uniqueNodeIds.length) return [];
  const { data, error } = await admin
    .from("question_nodes")
    .select("id")
    .eq("assessment_version_id", assessmentVersionId)
    .in("id", uniqueNodeIds);
  if (error) throw error;
  const found = new Set((data ?? []).map((node: { id: string }) => node.id));
  for (const id of uniqueNodeIds) {
    if (!found.has(id)) throw new Error("Question node not found for rubric award clearing");
  }
  return uniqueNodeIds;
}

async function buildRubricAwardRows(
  admin: any,
  assessmentVersionId: string,
  attemptId: string,
  markerProfileId: string,
  awards: NonNullable<Body["rubric_awards"]>,
) {
  if (!awards.length) return [];
  const questionNodeIds = [...new Set(awards.map((award) => award.question_node_id).filter(Boolean))];
  if (!questionNodeIds.length) return [];
  const { data: nodes, error: nodeError } = await admin
    .from("question_nodes")
    .select("id,marks")
    .eq("assessment_version_id", assessmentVersionId)
    .in("id", questionNodeIds);
  if (nodeError) throw nodeError;
  const nodeById = new Map((nodes ?? []).map((node: { id: string }) => [node.id, node]));
  const templateItemIds = [...new Set(awards.map((award) => award.rubric_template_item_id).filter((id): id is string => Boolean(id)))];
  const criteriaIds = [...new Set(awards.map((award) => award.rubric_criteria_id).filter((id): id is string => Boolean(id)))];

  const { data: templateItems, error: templateItemError } = templateItemIds.length
    ? await admin.from("rubric_template_items").select("id,max_marks").in("id", templateItemIds)
    : { data: [], error: null };
  if (templateItemError) throw templateItemError;
  const templateItemById = new Map((templateItems ?? []).map((item: { id: string }) => [item.id, item]));

  const { data: criteria, error: criteriaError } = criteriaIds.length
    ? await admin.from("rubric_criteria").select("id,question_node_id,max_marks").in("id", criteriaIds)
    : { data: [], error: null };
  if (criteriaError) throw criteriaError;
  const criteriaById = new Map((criteria ?? []).map((item: { id: string }) => [item.id, item]));

  return awards.map((award) => {
    if (!nodeById.has(award.question_node_id)) throw new Error("Question node not found for rubric award");
    if (!award.rubric_template_item_id && !award.rubric_criteria_id) throw new Error("Rubric award requires a rubric item");
    const maxMarks = award.rubric_template_item_id
      ? Number((templateItemById.get(award.rubric_template_item_id) as { max_marks?: number } | undefined)?.max_marks ?? 0)
      : Number((criteriaById.get(String(award.rubric_criteria_id)) as { max_marks?: number; question_node_id?: string | null } | undefined)?.max_marks ?? 0);
    const criteriaNodeId = award.rubric_criteria_id
      ? (criteriaById.get(String(award.rubric_criteria_id)) as { question_node_id?: string | null } | undefined)?.question_node_id
      : null;
    if (criteriaNodeId && criteriaNodeId !== award.question_node_id) throw new Error("Rubric criterion does not belong to this question");
    if (!Number.isFinite(award.awarded_marks) || award.awarded_marks < 0 || award.awarded_marks > maxMarks) {
      throw new Error("Rubric award exceeds its configured maximum");
    }
    return {
      attempt_id: attemptId,
      question_node_id: award.question_node_id,
      rubric_criteria_id: award.rubric_criteria_id ?? null,
      rubric_template_item_id: award.rubric_template_item_id ?? null,
      marker_profile_id: markerProfileId,
      awarded_marks: award.awarded_marks,
      selected: award.selected ?? true,
      feedback_text: award.feedback_text ?? null,
    };
  });
}
