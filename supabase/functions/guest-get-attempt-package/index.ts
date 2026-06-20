import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { handleOptions, json, readJson, errorResponse } from "../_shared/http.ts";
import { loadNormalizedPackage } from "../_shared/package-storage.ts";
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
    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: String(attempt.start_at_utc),
      endAtUtc: String(attempt.end_at_utc),
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc ? String(attempt.upload_deadline_at_utc) : null,
      pausedAtUtc: attempt.paused_at ? String(attempt.paused_at) : null,
      solutionsRequested: Boolean(attempt.solutions_requested),
    });
    if (state === "WAITING" || state === "PAUSED") return json(request, { error: "Content not available in the current state", state }, 403);
    if (attempt.delivery_mode === "seb_required") {
      return json(request, {
        error: "Guest SEB sessions are blocked: guest sitting is unavailable for SEB-required sessions unless verified secure mode is configured.",
        state,
        seb_required: true,
      }, 403);
    }

    const admin = getAdminClient();
    const [{ data: version, error }, { data: uploadSlots, error: slotError }] = await Promise.all([
      admin
      .from("assessment_versions")
      .select("id, normalized_package_json, normalized_package_path, encrypted_package_path, kms_provider, wrapped_data_key, encryption_metadata_json")
      .eq("id", attempt.assessment_version_id)
        .single(),
      admin
        .from("upload_slots")
        .select("id,attempt_id,question_node_id,required,status,locked_at,object_path,original_file_name,file_size_bytes,content_type,is_blank_placeholder")
        .eq("attempt_id", attempt.id)
        .order("created_at", { ascending: true }),
    ]);
    if (error) throw error;
    if (slotError) throw slotError;
    const assessmentPackage = await loadNormalizedPackage(admin, version);
    return json(request, {
      attempt_id: attempt.id,
      state,
      package_version_id: version.id,
      assessment_package: assessmentPackage,
      upload_slots: uploadSlots ?? [],
      asset_urls: {},
    });
  } catch (error) {
    return errorResponse(request, error, "guest-get-attempt-package failed");
  }
});
