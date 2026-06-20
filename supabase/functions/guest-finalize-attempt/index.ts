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
    const body = await readJson<{ guest_token?: string; attempt_id?: string; state_token?: string }>(request);
    if (!body.state_token) return json(request, { error: "state_token is required" }, 400);
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const statePayload = await verifyStateToken(body.state_token);
    if (statePayload.attempt_id !== attempt.id || statePayload.profile_id !== `guest:${attempt.id}`) {
      return json(request, { error: "State token does not match this guest attempt" }, 403);
    }
    const admin = getAdminClient();
    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: String(attempt.start_at_utc),
      endAtUtc: String(attempt.end_at_utc),
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc ? String(attempt.upload_deadline_at_utc) : null,
      pausedAtUtc: attempt.paused_at ? String(attempt.paused_at) : null,
      solutionsRequested: Boolean(attempt.solutions_requested),
    });
    if (state === "WAITING" || state === "PAUSED") return json(request, { error: "Cannot finalize in the current exam state", state }, 403);

    const { data: slots, error: slotError } = await admin
      .from("upload_slots")
      .select("id,question_node_id,required,status,locked_at,object_path,original_file_name")
      .eq("attempt_id", attempt.id)
      .eq("required", true);
    if (slotError) throw slotError;
    const missingRequiredUploads = (slots ?? []).filter((slot) => {
      if (slot.status === "uploaded" && slot.object_path && slot.locked_at) return false;
      if (slot.status === "blank_placeholder") return false;
      return true;
    });
    if (missingRequiredUploads.length) {
      return json(request, {
        error: "Missing required uploads",
        missing_required_uploads: missingRequiredUploads.map((slot) => ({
          upload_slot_id: slot.id,
          question_node_id: slot.question_node_id,
          status: slot.status,
        })),
      }, 409);
    }

    const receipt = {
      attempt_id: attempt.id,
      finalized_at: new Date().toISOString(),
      student_name: attempt.guest_student_name ?? null,
      student_number: attempt.guest_student_number ?? null,
      mode: "guest_code",
      upload_slots: (slots ?? []).map((slot) => ({
        upload_slot_id: slot.id,
        question_node_id: slot.question_node_id,
        status: slot.status,
        file_name: slot.original_file_name ?? null,
      })),
    };
    const { error: receiptError } = await admin.from("submission_receipts").upsert({
      attempt_id: attempt.id,
      receipt_json: receipt,
    }, { onConflict: "attempt_id" });
    if (receiptError) throw receiptError;
    await admin.from("attempt_events").insert({
      attempt_id: attempt.id,
      event_type: "attempt.finalized",
      payload_json: { actor: "guest", idempotent: true },
    });
    return json(request, { ok: true, attempt_id: attempt.id, receipt });
  } catch (error) {
    return errorResponse(request, error, "guest-finalize-attempt failed");
  }
});
