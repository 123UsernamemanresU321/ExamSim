import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import { errorResponse } from "../_shared/http.ts";
import {
  allowedSebOrigins,
  canonicalizeSebUrl,
  extractSebRequestHashes,
  validateSebPageUrl,
  verifySebRequestHashes,
} from "../_shared/seb.ts";
import { verifyStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attempt_id");
  const returnUrl = url.searchParams.get("return_url");
  const stateToken = url.searchParams.get("state_token");

  if (!attemptId || !returnUrl || !stateToken) {
    return new Response("Missing attempt_id, return_url, or state_token", { status: 400 });
  }

  const safeReturnUrl = validateSebPageUrl({
    pageUrl: returnUrl,
    attemptId,
    allowedOrigins: allowedSebOrigins(),
  });
  if (!safeReturnUrl.ok) return new Response(safeReturnUrl.reason, { status: 400 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return new Response("Server misconfigured", { status: 500 });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const tokenPayload = await verifyStateToken(stateToken);
    if (tokenPayload.attempt_id !== attemptId || !tokenPayload.attempt_session_id) {
      return redirectWithResult(safeReturnUrl.url, false, "State token does not match this SEB session");
    }

    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .select("id, assignee_profile_id, delivery_mode, seb_browser_exam_key_hashes, seb_config_key_hashes")
      .eq("id", attemptId)
      .single();
    if (attemptError) throw attemptError;
    if (attempt.assignee_profile_id !== tokenPayload.profile_id) {
      return redirectWithResult(safeReturnUrl.url, false, "Forbidden");
    }
    if (attempt.delivery_mode !== "seb_required") {
      return redirectWithResult(safeReturnUrl.url, true);
    }

    const { data: session, error: sessionError } = await supabase
      .from("attempt_sessions")
      .select("id, ended_at")
      .eq("id", tokenPayload.attempt_session_id)
      .eq("attempt_id", attemptId)
      .single();
    if (sessionError) throw sessionError;
    if (!session || session.ended_at) return redirectWithResult(safeReturnUrl.url, false, "Attempt session is not active");

    const hashes = extractSebRequestHashes(request);
    const validation = await verifySebRequestHashes({
      expectedBrowserExamKeys: attempt.seb_browser_exam_key_hashes,
      expectedConfigKeys: attempt.seb_config_key_hashes,
      receivedBrowserExamRequestHash: hashes.browserExamRequestHash,
      receivedConfigKeyRequestHash: hashes.configKeyRequestHash,
      url: request.url,
    });

    if (validation.ok) {
      await supabase
        .from("attempt_sessions")
        .update({
          seb_verified: true,
          browser_exam_key_hash: hashes.browserExamRequestHash,
          config_key_hash: hashes.configKeyRequestHash,
          seb_verified_at: new Date().toISOString(),
          seb_verification_method: "handshake_header",
          seb_verification_url: canonicalizeSebUrl(request.url),
          seb_last_error: null,
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("id", tokenPayload.attempt_session_id)
        .eq("attempt_id", attemptId);
    } else {
      await supabase
        .from("attempt_sessions")
        .update({ seb_last_error: validation.reason, last_heartbeat_at: new Date().toISOString() })
        .eq("id", tokenPayload.attempt_session_id)
        .eq("attempt_id", attemptId);
    }

    return redirectWithResult(safeReturnUrl.url, validation.ok, validation.ok ? undefined : validation.reason);
  } catch (error) {
    console.error("SEB handshake failed:", error);
    return errorResponse(error, "seb-handshake failed");
  }
});

function redirectWithResult(returnUrl: string, ok: boolean, reason?: string) {
  const finalReturnUrl = new URL(returnUrl);
  finalReturnUrl.searchParams.set("seb_handshake", ok ? "success" : "failed");
  if (!ok) finalReturnUrl.searchParams.set("seb_error", reason ?? "SEB verification failed");
  return new Response(null, {
    status: 302,
    headers: { Location: finalReturnUrl.toString() },
  });
}
