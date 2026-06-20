import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { hashAttemptClaimCode, normalizeAttemptClaimCode } from "../_shared/attempt-claim.ts";
import { auditOwnerAction, profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit, requestIpKey } from "../_shared/rate-limit.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    if (profile.app_role !== "student") throw new Error("Student role required");
    const body = await readJson<{ claim_code?: string }>(request);
    const claimCode = normalizeAttemptClaimCode(String(body.claim_code ?? ""));

    await enforceRateLimit(admin, {
      scope: "attempt-claim-redeem:ip",
      key: requestIpKey(request),
      limit: 30,
      windowSeconds: 3600,
    });
    await enforceRateLimit(admin, {
      scope: "attempt-claim-redeem:student",
      key: profile.id,
      limit: 12,
      windowSeconds: 3600,
    });

    const claimCodeHash = await hashAttemptClaimCode(claimCode);
    const { data, error } = await admin.rpc("consume_attempt_claim_code", {
      p_claim_code_hash: claimCodeHash,
      p_student_profile_id: profile.id,
    });
    if (error) throw error;
    const result = data?.[0] as { claim_result?: string; claimed_attempt_id?: string | null } | undefined;
    if (!result || result.claim_result === "invalid" || !result.claimed_attempt_id) {
      return json(request, { error: "That claim code is invalid or has expired." }, 400);
    }

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id,exam_session_id,exam_sessions!inner(owner_profile_id)")
      .eq("id", result.claimed_attempt_id)
      .single();
    if (attemptError) throw attemptError;
    const ownerProfileId = String((attempt.exam_sessions as { owner_profile_id?: string } | null)?.owner_profile_id ?? "");

    if (result.claim_result === "linked") {
      await admin
        .from("attempt_access_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("attempt_id", attempt.id)
        .eq("purpose", "guest_attempt")
        .is("revoked_at", null);
    }

    if (ownerProfileId) {
      await auditOwnerAction(ownerProfileId, user.id, `attempt_claim.${result.claim_result}`, "attempts", attempt.id, {
        student_profile_id: profile.id,
      });
    }

    return json(request, {
      ok: true,
      status: result.claim_result,
      attempt_id: result.claim_result === "linked" ? attempt.id : null,
    });
  } catch (error) {
    return errorResponse(request, error, "Could not claim attempt");
  }
});

