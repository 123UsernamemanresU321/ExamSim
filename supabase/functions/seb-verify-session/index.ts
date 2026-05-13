import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import {
  allowedSebOrigins,
  extractSebRequestHashes,
  receivedHashesFromJsApi,
  sebVerificationTtlSeconds,
  validateSebPageUrl,
  verifySebRequestHashes,
  type SebRequestHashes,
  type SebVerificationMethod,
} from "../_shared/seb.ts";
import { verifyStateToken } from "../_shared/state-token.ts";

type Body = {
  attempt_id: string;
  attempt_session_id: string;
  state_token: string;
  mode?: "header" | "js_api";
  browser_exam_request_hash?: string;
  config_key_request_hash?: string;
  page_url?: string;
  seb_version?: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  let admin: Awaited<ReturnType<typeof requireUser>>["admin"] | null = null;
  let attemptId: string | null = null;
  let attemptSessionId: string | null = null;

  try {
    const auth = await requireUser(request);
    admin = auth.admin;
    const profile = await profileForAuthUser(auth.user.id);
    if (profile.app_role !== "student") return json({ error: "Student role required" }, 403);

    const body = await readJson<Body>(request);
    attemptId = body.attempt_id;
    attemptSessionId = body.attempt_session_id;
    if (!body.attempt_id || !body.attempt_session_id || !body.state_token) {
      return json({ error: "attempt_id, attempt_session_id, and state_token are required" }, 400);
    }

    const tokenPayload = await verifyStateToken(body.state_token);
    if (
      tokenPayload.attempt_id !== body.attempt_id ||
      tokenPayload.profile_id !== profile.id ||
      tokenPayload.attempt_session_id !== body.attempt_session_id
    ) {
      await recordSebFailure(admin, body.attempt_session_id, body.attempt_id, "State token does not match this SEB session");
      return json({ error: "State token does not match this SEB session" }, 403);
    }

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id, assignee_profile_id, delivery_mode, seb_browser_exam_key_hashes, seb_config_key_hashes")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    if (attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);
    if (attempt.delivery_mode !== "seb_required") return json({ ok: true, seb_verified: true, method: "not_required" });

    const { data: session, error: sessionError } = await admin
      .from("attempt_sessions")
      .select("id, attempt_id, ended_at")
      .eq("id", body.attempt_session_id)
      .eq("attempt_id", body.attempt_id)
      .single();
    if (sessionError) throw sessionError;
    if (!session || session.ended_at) return json({ error: "Attempt session is not active" }, 403);

    const verification = resolveVerificationInput(request, body);
    if (!verification.ok) {
      await recordSebFailure(admin, body.attempt_session_id, body.attempt_id, verification.reason);
      return json({ error: verification.reason, seb_required: true }, 403);
    }

    const validation = await verifySebRequestHashes({
      expectedBrowserExamKeys: attempt.seb_browser_exam_key_hashes,
      expectedConfigKeys: attempt.seb_config_key_hashes,
      receivedBrowserExamRequestHash: verification.hashes.browserExamRequestHash,
      receivedConfigKeyRequestHash: verification.hashes.configKeyRequestHash,
      url: verification.url,
    });

    if (!validation.ok) {
      await recordSebFailure(admin, body.attempt_session_id, body.attempt_id, validation.reason);
      return json({ error: validation.reason, seb_required: true }, 403);
    }

    const verifiedAt = new Date();
    await admin
      .from("attempt_sessions")
      .update({
        seb_verified: true,
        browser_exam_key_hash: verification.hashes.browserExamRequestHash,
        config_key_hash: verification.hashes.configKeyRequestHash,
        seb_verified_at: verifiedAt.toISOString(),
        seb_verification_method: verification.method,
        seb_verification_url: verification.url,
        seb_version: sanitizeSebVersion(body.seb_version),
        seb_last_error: null,
        last_heartbeat_at: verifiedAt.toISOString(),
      })
      .eq("id", body.attempt_session_id)
      .eq("attempt_id", body.attempt_id);

    return json({
      ok: true,
      seb_verified: true,
      method: verification.method,
      expires_at_utc: new Date(verifiedAt.getTime() + sebVerificationTtlSeconds() * 1000).toISOString(),
    });
  } catch (error) {
    if (admin && attemptId && attemptSessionId) {
      await recordSebFailure(admin, attemptSessionId, attemptId, error instanceof Error ? error.message : "SEB verification failed");
    }
    return errorResponse(error, "seb-verify-session failed");
  }
});

function resolveVerificationInput(
  request: Request,
  body: Body,
):
  | { ok: true; method: SebVerificationMethod; url: string; hashes: SebRequestHashes }
  | { ok: false; reason: string } {
  if (body.mode === "js_api") {
    const hashes = receivedHashesFromJsApi(body as Record<string, unknown>);
    if (!body.page_url) return { ok: false, reason: "SEB page URL is required for JavaScript API verification." };
    const pageUrl = validateSebPageUrl({
      pageUrl: body.page_url,
      attemptId: body.attempt_id,
      allowedOrigins: allowedSebOrigins(),
    });
    if (!pageUrl.ok) return pageUrl;
    return { ok: true, method: "js_api", url: pageUrl.url, hashes };
  }

  const hashes = extractSebRequestHashes(request);
  return { ok: true, method: "header", url: request.url, hashes };
}

async function recordSebFailure(admin: QueryAdmin, attemptSessionId: string, attemptId: string, reason: string) {
  await admin
    .from("attempt_sessions")
    .update({
      seb_last_error: reason.slice(0, 500),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("id", attemptSessionId)
    .eq("attempt_id", attemptId);
}

function sanitizeSebVersion(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 160) : null;
}

type QueryAdmin = Awaited<ReturnType<typeof requireUser>>["admin"];
