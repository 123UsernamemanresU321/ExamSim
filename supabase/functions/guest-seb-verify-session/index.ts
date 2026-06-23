import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import {
  allowedSebOrigins,
  guestSebEnabled,
  receivedHashesFromJsApi,
  sebVerificationTtlSeconds,
  validateGuestSebPageUrl,
  verifySebRequestHashes,
} from "../_shared/seb.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { verifyStateToken } from "../_shared/state-token.ts";

type Body = {
  guest_token?: string;
  attempt_id?: string;
  attempt_session_id?: string;
  state_token?: string;
  mode?: "js_api";
  browser_exam_request_hash?: string;
  config_key_request_hash?: string;
  page_url?: string;
  seb_version?: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<Body>(request);
    if (!body.attempt_id || !body.attempt_session_id || !body.state_token) return json(request, { error: "attempt_id, attempt_session_id, and state_token are required" }, 400);
    if (body.mode !== "js_api") {
      return json(request, { error: "Guest SEB verification requires URL-specific JavaScript API evidence." }, 400);
    }
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const token = await verifyStateToken(body.state_token);
    if (token.attempt_id !== attempt.id || token.profile_id !== `guest:${attempt.id}` || token.attempt_session_id !== body.attempt_session_id) {
      return json(request, { error: "State token does not match this guest attempt session" }, 403);
    }
    if (attempt.delivery_mode !== "seb_required") return json(request, { ok: true, seb_verified: true, method: "not_required" });
    if (!guestSebEnabled()) {
      return json(request, { error: "Guest SEB verification is disabled until a real Safe Exam Browser client passes live validation", seb_required: true }, 503);
    }
    const admin = getAdminClient();
    const { data: attemptSession, error: sessionError } = await admin.from("attempt_sessions")
      .select("id,attempt_id,ended_at")
      .eq("id", body.attempt_session_id)
      .eq("attempt_id", attempt.id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!attemptSession || attemptSession.ended_at) return json(request, { error: "Guest attempt session is not active" }, 403);

    const hashes = receivedHashesFromJsApi(body as Record<string, unknown>);
    const pageValidation = validateGuestSebPageUrl({
      pageUrl: String(body.page_url ?? ""),
      attemptSessionId: attemptSession.id,
      allowedOrigins: allowedSebOrigins(),
    });
    if (!pageValidation.ok) return json(request, { error: pageValidation.reason, seb_required: true }, 403);
    const validation = await verifySebRequestHashes({
      expectedBrowserExamKeys: attempt.seb_browser_exam_key_hashes,
      expectedConfigKeys: attempt.seb_config_key_hashes,
      receivedBrowserExamRequestHash: hashes.browserExamRequestHash,
      receivedConfigKeyRequestHash: hashes.configKeyRequestHash,
      url: pageValidation.url,
    });
    if (!validation.ok) return json(request, { error: validation.reason, seb_required: true }, 403);
    const verifiedAt = new Date();
    const { error: updateError } = await admin.from("attempt_sessions").update({
      seb_verified: true,
      browser_exam_key_hash: hashes.browserExamRequestHash,
      config_key_hash: hashes.configKeyRequestHash,
      seb_verified_at: verifiedAt.toISOString(),
      seb_verification_method: "js_api",
      seb_verification_url: pageValidation.url,
      seb_version: cleanVersion(body.seb_version),
      seb_last_error: null,
      last_heartbeat_at: verifiedAt.toISOString(),
    }).eq("id", attemptSession.id).eq("attempt_id", attempt.id);
    if (updateError) throw updateError;
    return json(request, { ok: true, seb_verified: true, expires_at_utc: new Date(verifiedAt.getTime() + sebVerificationTtlSeconds() * 1000).toISOString() });
  } catch (error) {
    return errorResponse(request, error, "guest-seb-verify-session failed");
  }
});

function cleanVersion(value: string | undefined) {
  const result = value?.trim();
  return result ? result.slice(0, 160) : null;
}
