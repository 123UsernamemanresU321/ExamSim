import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { loadNormalizedPackage } from "../_shared/package-storage.ts";
import {
  canonicalizeSebUrl,
  extractSebRequestHashes,
  sebVerificationTtlSeconds,
  verifySebRequestHashes,
} from "../_shared/seb.ts";
import { verifyStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{
      attempt_id: string;
      state_token: string;
    }>(request);
    if (!body.attempt_id || !body.state_token) return json({ error: "attempt_id and state_token are required" }, 400);
    const tokenPayload = await verifyStateToken(body.state_token);
    if (tokenPayload.attempt_id !== body.attempt_id || tokenPayload.profile_id !== profile.id) {
      return json({ error: "State token does not match this attempt" }, 403);
    }

    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (profile.app_role !== "owner" && attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);

    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      solutionsRequested: attempt.solutions_requested,
    });
    if (state === "WAITING") return json({ error: "Content not available yet", state }, 403);
    let sebVerified = attempt.delivery_mode === "browser";

    if (attempt.delivery_mode === "seb_required") {
      if (!tokenPayload.attempt_session_id) {
        return json({ error: "SEB attempts require a session-bound state token", state, seb_required: true }, 403);
      }

      const { data: session } = await admin
        .from("attempt_sessions")
        .select("seb_verified, browser_exam_key_hash, config_key_hash, ended_at, seb_verified_at, seb_verification_url")
        .eq("id", tokenPayload.attempt_session_id)
        .eq("attempt_id", attempt.id)
        .single();

      if (!session || session.ended_at) {
        return json({ error: "SEB attempt session is not active", state, seb_required: true }, 403);
      }

      const currentHashes = extractSebRequestHashes(request);
      const hasCurrentHeaderHashes = Boolean(currentHashes.browserExamRequestHash || currentHashes.configKeyRequestHash);

      if (hasCurrentHeaderHashes) {
        const validation = await verifySebRequestHashes({
          expectedBrowserExamKeys: attempt.seb_browser_exam_key_hashes,
          expectedConfigKeys: attempt.seb_config_key_hashes,
          receivedBrowserExamRequestHash: currentHashes.browserExamRequestHash,
          receivedConfigKeyRequestHash: currentHashes.configKeyRequestHash,
          url: request.url,
        });
        if (!validation.ok) return json({ error: validation.reason, state, seb_required: true }, 403);

        sebVerified = true;
        await admin
          .from("attempt_sessions")
          .update({
            seb_verified: true,
            browser_exam_key_hash: currentHashes.browserExamRequestHash,
            config_key_hash: currentHashes.configKeyRequestHash,
            seb_verified_at: new Date().toISOString(),
            seb_verification_method: "header",
            seb_verification_url: canonicalizeSebUrl(request.url),
            seb_last_error: null,
            last_heartbeat_at: new Date().toISOString(),
          })
          .eq("id", tokenPayload.attempt_session_id)
          .eq("attempt_id", attempt.id);
      } else {
        if (!session.seb_verified || !session.seb_verified_at || !session.seb_verification_url) {
          return json({ error: "Safe Exam Browser verification is required before content release", state, seb_required: true }, 403);
        }

        const verifiedAtMs = Date.parse(session.seb_verified_at);
        if (!Number.isFinite(verifiedAtMs) || verifiedAtMs + sebVerificationTtlSeconds() * 1000 < Date.now()) {
          return json({ error: "Safe Exam Browser verification expired. Refresh verification before content release.", state, seb_required: true }, 403);
        }

        const storedValidation = await verifySebRequestHashes({
          expectedBrowserExamKeys: attempt.seb_browser_exam_key_hashes,
          expectedConfigKeys: attempt.seb_config_key_hashes,
          receivedBrowserExamRequestHash: session.browser_exam_key_hash,
          receivedConfigKeyRequestHash: session.config_key_hash,
          url: session.seb_verification_url,
        });
        if (!storedValidation.ok) {
          return json({ error: "Stored SEB session no longer matches this attempt configuration.", state, seb_required: true }, 403);
        }

        sebVerified = true;
        await admin
          .from("attempt_sessions")
          .update({
            last_heartbeat_at: new Date().toISOString(),
          })
          .eq("id", tokenPayload.attempt_session_id)
          .eq("attempt_id", attempt.id);
      }

      if (!sebVerified) {
        return json({ error: "Safe Exam Browser verification is required before content release", state, seb_required: true }, 403);
      }
    }

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("id, normalized_package_json, normalized_package_path, encrypted_package_path, kms_provider, wrapped_data_key, encryption_metadata_json")
      .eq("id", attempt.assessment_version_id)
      .single();
    if (versionError) throw versionError;
    const assessmentPackage = await loadNormalizedPackage(admin, version);
    const assetUrls = await signPackageAssetUrls(admin, assessmentPackage);

    return json({
      attempt_id: attempt.id,
      state,
      package_version_id: version.id,
      rendering_mode: "normalized_html",
      seb_verified: sebVerified,
      assessment_package: assessmentPackage,
      asset_urls: assetUrls,
    });
  } catch (error) {
    return errorResponse(error, "get-attempt-package failed");
  }
});

async function signPackageAssetUrls(
  admin: {
    storage: {
      from(bucket: string): {
        createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: Error | null }>;
      };
    };
  },
  assessmentPackage: Record<string, unknown>,
) {
  const paths = new Set<string>();
  collectAssetPaths(assessmentPackage.questions, paths);
  const urls: Record<string, string> = {};
  for (const path of paths) {
    if (!isSafePackageAssetPath(path)) continue;
    const { data, error } = await admin.storage.from("assessment-packages").createSignedUrl(path, 300);
    if (error) throw error;
    if (data?.signedUrl) urls[path] = data.signedUrl;
  }
  return urls;
}

function collectAssetPaths(value: unknown, paths: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetPaths(item, paths);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.assets)) {
    for (const asset of record.assets) {
      if (typeof asset === "string") paths.add(asset);
    }
  }
  collectAssetPaths(record.children, paths);
}

function isSafePackageAssetPath(path: string) {
  return Boolean(path.trim()) && !path.includes("..") && !path.startsWith("/") && !path.includes("\\");
}
