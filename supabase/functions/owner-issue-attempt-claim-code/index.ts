import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { attemptClaimExpiry, generateAttemptClaimCode, hashAttemptClaimCode } from "../_shared/attempt-claim.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit, requestIpKey } from "../_shared/rate-limit.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "student_management");
    const body = await readJson<{ attempt_id?: string; lifetime_seconds?: number }>(request);
    const attemptId = String(body.attempt_id ?? "").trim();
    if (!attemptId) return json(request, { error: "Attempt is required" }, 400);

    await enforceRateLimit(admin, {
      scope: "attempt-claim-issue:ip",
      key: requestIpKey(request),
      limit: 40,
      windowSeconds: 3600,
    });
    await enforceRateLimit(admin, {
      scope: "attempt-claim-issue:owner",
      key: ownerProfileId,
      limit: 80,
      windowSeconds: 3600,
    });

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id,exam_session_id,assignee_profile_id,claim_status,exam_sessions!inner(owner_profile_id)")
      .eq("id", attemptId)
      .maybeSingle();
    if (attemptError) throw attemptError;
    const sessionOwnerId = String((attempt?.exam_sessions as { owner_profile_id?: string } | null)?.owner_profile_id ?? "");
    if (!attempt || sessionOwnerId !== ownerProfileId) throw new Error("Attempt not found");
    if (attempt.assignee_profile_id || attempt.claim_status === "linked") throw new Error("This attempt is already linked");

    const { data: release, error: releaseError } = await admin
      .from("feedback_releases")
      .select("id")
      .eq("attempt_id", attemptId)
      .eq("visible_to_student", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (releaseError) throw releaseError;
    if (!release) throw new Error("Release feedback before issuing a claim code");

    const claimCode = generateAttemptClaimCode();
    const expiresAt = attemptClaimExpiry(new Date(), body.lifetime_seconds);
    const { error: updateError } = await admin
      .from("attempts")
      .update({
        claim_status: "unclaimed",
        claim_code_hash: await hashAttemptClaimCode(claimCode),
        claim_code_expires_at: expiresAt,
        claim_code_used_at: null,
        claim_requested_by_profile_id: null,
        claim_reviewed_at: null,
        claim_reviewed_by_profile_id: null,
      })
      .eq("id", attemptId);
    if (updateError) throw updateError;

    await auditOwnerAction(ownerProfileId, user.id, "attempt_claim.code_issued", "attempts", attemptId, {
      expires_at: expiresAt,
      feedback_release_id: release.id,
    });

    return json(request, { ok: true, claim_code: claimCode, expires_at: expiresAt });
  } catch (error) {
    return errorResponse(request, error, "Could not issue claim code");
  }
});
