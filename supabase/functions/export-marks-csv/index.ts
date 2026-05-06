import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { corsHeaders, handleOptions, readJson } from "../_shared/http.ts";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id?: string }>(request);
    const query = admin
      .from("marks")
      .select("attempt_id,question_node_id,rubric_criteria_id,awarded_marks,notes,created_at");
    const { data: marks, error } = body.attempt_id
      ? await query.eq("attempt_id", body.attempt_id)
      : await query.order("created_at", { ascending: false });
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

    await auditOwnerAction(ownerProfile.id, user.id, "marks_csv.exported", body.attempt_id ? "attempts" : null, body.attempt_id ?? null);

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="exam-vault-marks.csv"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "export-marks-csv failed" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
