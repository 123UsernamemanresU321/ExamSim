import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { handleOptions, json, readJson, errorResponse } from "../_shared/http.ts";
import { loadNormalizedPackage } from "../_shared/package-storage.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { verifyStateToken } from "../_shared/state-token.ts";
import { guestSebEnabled, sebVerificationTtlSeconds, verifySebRequestHashes } from "../_shared/seb.ts";

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
    if (!statePayload.attempt_session_id) return json(request, { error: "Guest package release requires a session-bound state token" }, 403);
    const admin = getAdminClient();
    const { data: attemptSession, error: attemptSessionError } = await admin.from("attempt_sessions")
      .select("id,attempt_id,ended_at,seb_verified,seb_verified_at,seb_verification_url,browser_exam_key_hash,config_key_hash")
      .eq("id", statePayload.attempt_session_id)
      .eq("attempt_id", attempt.id)
      .maybeSingle();
    if (attemptSessionError) throw attemptSessionError;
    if (!attemptSession || attemptSession.ended_at) return json(request, { error: "Guest attempt session is not active" }, 403);
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
      if (!guestSebEnabled()) {
        return json(request, { error: "Guest SEB release is disabled until a real Safe Exam Browser client passes live validation", state, seb_required: true }, 503);
      }
      if (!attemptSession.seb_verified || !attemptSession.seb_verified_at || !attemptSession.seb_verification_url) {
        return json(request, { error: "Safe Exam Browser verification is required before guest content release", state, seb_required: true }, 403);
      }
      const verifiedAt = Date.parse(attemptSession.seb_verified_at);
      if (!Number.isFinite(verifiedAt) || verifiedAt + sebVerificationTtlSeconds() * 1000 < Date.now()) {
        return json(request, { error: "Guest Safe Exam Browser verification expired", state, seb_required: true }, 403);
      }
      const verification = await verifySebRequestHashes({
        expectedBrowserExamKeys: attempt.seb_browser_exam_key_hashes,
        expectedConfigKeys: attempt.seb_config_key_hashes,
        receivedBrowserExamRequestHash: attemptSession.browser_exam_key_hash,
        receivedConfigKeyRequestHash: attemptSession.config_key_hash,
        url: attemptSession.seb_verification_url,
      });
      if (!verification.ok) return json(request, { error: verification.reason, state, seb_required: true }, 403);
    }

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
