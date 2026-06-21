import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string }>(request);
    if (!body.attempt_id) return json(request, { error: "attempt_id is required" }, 400);

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id, assignee_profile_id, assessments(title, paper_code)")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    if (attempt.assignee_profile_id !== profile.id) return json(request, { error: "Forbidden" }, 403);

    const { data: slots, error: slotError } = await admin.from("upload_slots").select("*").eq("attempt_id", body.attempt_id).order("created_at");
    if (slotError) throw slotError;
    const slotIds = (slots ?? []).map((slot: { id: string }) => slot.id);
    const { data: checks, error: checkError } = slotIds.length
      ? await admin.from("upload_sanity_checks").select("*").in("upload_slot_id", slotIds).order("created_at")
      : { data: [], error: null };
    if (checkError) throw checkError;

    const latestCheckBySlot = new Map<string, Record<string, unknown>>();
    for (const check of checks ?? []) latestCheckBySlot.set(check.upload_slot_id, check);
    const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments;
    const receipt = {
      assessment_title: assessment?.title ?? "Assessment",
      paper_code: assessment?.paper_code ?? null,
      attempt_short_code: String(attempt.id).slice(0, 8).toUpperCase(),
      finalized_at: new Date().toISOString(),
      slots: (slots ?? []).map((slot: Record<string, unknown>) => {
        const check = latestCheckBySlot.get(String(slot.id));
        return {
          question_node_id: slot.question_node_id,
          status: slot.status,
          file_name: slot.original_file_name,
          uploaded_at: slot.uploaded_at,
          page_count: check?.page_count ?? null,
          sanity_status: check?.status ?? null,
          warnings: check?.warnings_json ?? [],
          file_hash: check?.file_hash ?? null,
        };
      }),
    };

    const { data, error } = await admin
      .from("submission_receipts")
      .upsert({ attempt_id: body.attempt_id, receipt_json: receipt }, { onConflict: "attempt_id" })
      .select("*")
      .single();
    if (error) throw error;
    return json(request, { ok: true, receipt: data });
  } catch (error) {
    return errorResponse(request, error, "create-submission-receipt failed");
  }
});
