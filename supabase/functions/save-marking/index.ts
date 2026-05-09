import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  attempt_id: string;
  marks?: {
    question_node_id?: string | null;
    rubric_criteria_id?: string | null;
    awarded_marks: number;
    notes?: string | null;
  }[];
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
      .select("id")
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
    
    if (rubricRows.length > 0) {
      const { error: marksError } = await admin.from("marks").upsert(rubricRows, {
        onConflict: "attempt_id,rubric_criteria_id",
      });
      if (marksError) throw marksError;
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
      annotation_count: annotationRows.length,
    });

    return json({ ok: true, mark_count: markRows.length, annotation_count: annotationRows.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "save-marking failed" }, 401);
  }
});
