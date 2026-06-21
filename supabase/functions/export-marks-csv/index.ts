import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, handleOptions, readJson } from "../_shared/http.ts";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "exports");
    const body = await readJson<{ attempt_id?: string }>(request);
    const { data: assessments, error: assessmentError } = await admin
      .from("assessments")
      .select("id")
      .eq("owner_profile_id", ownerProfileId);
    if (assessmentError) throw assessmentError;
    const assessmentIds = (assessments ?? []).map((assessment) => assessment.id);
    const { data: attempts, error: attemptError } = assessmentIds.length
      ? await admin.from("attempts").select("id").in("assessment_id", assessmentIds)
      : { data: [], error: null };
    if (attemptError) throw attemptError;
    const ownedAttemptIds = new Set((attempts ?? []).map((attempt) => attempt.id));
    if (body.attempt_id && !ownedAttemptIds.has(body.attempt_id)) throw new Error("Attempt is outside this institution");
    const selectedAttemptIds = body.attempt_id ? [body.attempt_id] : [...ownedAttemptIds];
    const query = admin
      .from("marks")
      .select("attempt_id,question_node_id,rubric_criteria_id,awarded_marks,notes,created_at")
      .in("attempt_id", selectedAttemptIds.length ? selectedAttemptIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: marks, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    const rows = [
      ["attempt_id", "question_node_id", "rubric_criteria_id", "awarded_marks", "notes", "created_at"],
      ...(marks ?? []).map((mark) => [
        mark.attempt_id,
        mark.question_node_id,
        mark.rubric_criteria_id,
        mark.awarded_marks,
        mark.notes,
        mark.created_at,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");

    await auditOwnerAction(ownerProfileId, user.id, "marks_csv.exported", body.attempt_id ? "attempts" : null, body.attempt_id ?? null, {
      exported_row_count: marks?.length ?? 0,
    });

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="exam-vault-marks.csv"`,
      },
    });
  } catch (error) {
    return errorResponse(error, "export-marks-csv failed");
  }
});
