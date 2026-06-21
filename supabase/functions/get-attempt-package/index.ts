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
    if (!body.attempt_id || !body.state_token) return json(request, { error: "attempt_id and state_token are required" }, 400);
    const tokenPayload = await verifyStateToken(body.state_token);
    if (tokenPayload.attempt_id !== body.attempt_id || tokenPayload.profile_id !== profile.id) {
      return json(request, { error: "State token does not match this attempt" }, 403);
    }

    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (attempt.assignee_profile_id !== profile.id) return json(request, { error: "Forbidden" }, 403);

    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      pausedAtUtc: attempt.paused_at,
      solutionsRequested: attempt.solutions_requested,
    });
    if (state === "WAITING" || state === "PAUSED") return json(request, { error: "Content not available in the current state", state }, 403);
    let sebVerified = attempt.delivery_mode === "browser";

    if (attempt.delivery_mode === "seb_required") {
      if (!tokenPayload.attempt_session_id) {
        return json(request, { error: "SEB attempts require a session-bound state token", state, seb_required: true }, 403);
      }

      const { data: session } = await admin
        .from("attempt_sessions")
        .select("seb_verified, browser_exam_key_hash, config_key_hash, ended_at, seb_verified_at, seb_verification_url")
        .eq("id", tokenPayload.attempt_session_id)
        .eq("attempt_id", attempt.id)
        .single();

      if (!session || session.ended_at) {
        return json(request, { error: "SEB attempt session is not active", state, seb_required: true }, 403);
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
        if (!validation.ok) return json(request, { error: validation.reason, state, seb_required: true }, 403);

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
          return json(request, { error: "Safe Exam Browser verification is required before content release", state, seb_required: true }, 403);
        }

        const verifiedAtMs = Date.parse(session.seb_verified_at);
        if (!Number.isFinite(verifiedAtMs) || verifiedAtMs + sebVerificationTtlSeconds() * 1000 < Date.now()) {
          return json(request, { error: "Safe Exam Browser verification expired. Refresh verification before content release.", state, seb_required: true }, 403);
        }

        const storedValidation = await verifySebRequestHashes({
          expectedBrowserExamKeys: attempt.seb_browser_exam_key_hashes,
          expectedConfigKeys: attempt.seb_config_key_hashes,
          receivedBrowserExamRequestHash: session.browser_exam_key_hash,
          receivedConfigKeyRequestHash: session.config_key_hash,
          url: session.seb_verification_url,
        });
        if (!storedValidation.ok) {
          return json(request, { error: "Stored SEB session no longer matches this attempt configuration.", state, seb_required: true }, 403);
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
        return json(request, { error: "Safe Exam Browser verification is required before content release", state, seb_required: true }, 403);
      }
    }

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("id, normalized_package_json, normalized_package_path, encrypted_package_path, kms_provider, wrapped_data_key, encryption_metadata_json")
      .eq("id", attempt.assessment_version_id)
      .single();
    if (versionError) throw versionError;
    const assessmentPackage = await loadNormalizedPackage(admin, version);
    const assessmentPackageWithDatabaseIds = await hydratePackageQuestionNodeIds(admin, assessmentPackage, attempt.assessment_version_id);
    const assetUrls = await signPackageAssetUrls(admin, assessmentPackageWithDatabaseIds);

    return json(request, {
      attempt_id: attempt.id,
      state,
      package_version_id: version.id,
      rendering_mode: "normalized_html",
      seb_verified: sebVerified,
      assessment_package: assessmentPackageWithDatabaseIds,
      asset_urls: assetUrls,
    });
  } catch (error) {
    return errorResponse(request, error, "get-attempt-package failed");
  }
});

async function hydratePackageQuestionNodeIds(
  admin: {
    from(table: "question_nodes"): {
      select(columns: string): {
        eq(column: string, value: string): Promise<{ data: { id: string; node_key: string }[] | null; error: Error | null }>;
      };
    };
  },
  assessmentPackage: Record<string, unknown>,
  assessmentVersionId: string,
) {
  const { data, error } = await admin
    .from("question_nodes")
    .select("id,node_key")
    .eq("assessment_version_id", assessmentVersionId);
  if (error) throw error;

  const idByNodeKey = new Map((data ?? []).map((node) => [node.node_key, node.id]));
  return {
    ...assessmentPackage,
    questions: hydrateQuestionNodes(assessmentPackage.questions, idByNodeKey),
  };
}

function hydrateQuestionNodes(value: unknown, idByNodeKey: Map<string, string>): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const node = item as Record<string, unknown>;
    const nodeKey = typeof node.node_key === "string" ? node.node_key : "";
    return {
      ...node,
      node_id: idByNodeKey.get(nodeKey) ?? node.node_id,
      children: hydrateQuestionNodes(node.children, idByNodeKey),
    };
  });
}

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
