import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
import {
  buildMineruAuthHeaders,
  mineruApiBaseUrl,
  pickMineruExtractResult,
} from "../_shared/mineru-hosted.ts";

type Body = {
  parse_job_id: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.parse_job_id) return json({ error: "parse_job_id is required" }, 400);

    const { data: parseJob, error: parseJobError } = await admin.from("parse_jobs").select("*").eq("id", body.parse_job_id).single();
    if (parseJobError) throw parseJobError;
    if (parseJob.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);
    if (parseJob.external_provider !== "mineru_hosted" || !parseJob.external_batch_id) {
      return json({ error: "Parse job has not been submitted to hosted MinerU" }, 400);
    }

    const resultResponse = await fetch(`${mineruApiBaseUrl()}/api/v4/extract-results/batch/${parseJob.external_batch_id}`, {
      method: "GET",
      headers: buildMineruAuthHeaders(),
    });
    const rawResult = await resultResponse.json();
    if (!resultResponse.ok) throw new Error(`MinerU result lookup failed: ${resultResponse.status}`);
    const result = pickMineruExtractResult(rawResult, parseJob.external_data_id ?? parseJob.id);

    if (result.state !== "done") {
      const status = result.state === "failed" ? "failed" : "running";
      const { error: updateError } = await admin
        .from("parse_jobs")
        .update({
          status,
          external_state: result.state,
          error_message: result.error,
          completed_at: status === "failed" ? new Date().toISOString() : null,
          metadata_json: { ...(parseJob.metadata_json ?? {}), last_mineru_result: result.raw },
        })
        .eq("id", parseJob.id);
      if (updateError) throw updateError;
      return json({ ok: true, status, external_state: result.state, error_message: result.error });
    }

    if (!result.fullZipUrl) throw new Error("MinerU result is done but did not include full_zip_url");
    const zipResponse = await fetch(result.fullZipUrl);
    if (!zipResponse.ok) throw new Error(`Could not download MinerU result ZIP: ${zipResponse.status}`);
    const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
    const zipPath = `parse-jobs/${parseJob.id}/mineru-hosted-result.zip`;
    const { error: zipUploadError } = await admin.storage.from("assessment-packages").upload(zipPath, zipBytes, {
      contentType: "application/zip",
      upsert: true,
    });
    if (zipUploadError) throw zipUploadError;

    const artifacts = await extractAndUploadArtifacts(admin, parseJob.id, zipBytes);
    const now = new Date().toISOString();
    const { error: artifactError } = await admin.from("parse_job_artifacts").insert([
      {
        parse_job_id: parseJob.id,
        artifact_kind: "zip",
        object_path: zipPath,
        content_preview: "Hosted MinerU result ZIP.",
      },
      ...artifacts,
    ]);
    if (artifactError) throw artifactError;

    const primaryArtifact = artifacts.find((artifact) => artifact.artifact_kind === "markdown") ?? artifacts.find((artifact) => artifact.artifact_kind === "json");
    const { error: updateError } = await admin
      .from("parse_jobs")
      .update({
        status: "review_required",
        result_object_path: primaryArtifact?.object_path ?? zipPath,
        external_state: result.state,
        error_message: null,
        completed_at: now,
        metadata_json: { ...(parseJob.metadata_json ?? {}), last_mineru_result: result.raw, full_zip_url_consumed_at: now },
      })
      .eq("id", parseJob.id);
    if (updateError) throw updateError;

    await admin
      .from("assessment_versions")
      .update({
        parse_confidence: 0.72,
        requires_owner_review: true,
        status: "review_required",
      })
      .eq("id", parseJob.assessment_version_id);

    await auditOwnerAction(ownerProfile.id, user.id, "mineru_hosted.completed", "parse_jobs", parseJob.id, {
      artifact_count: artifacts.length + 1,
      result_object_path: primaryArtifact?.object_path ?? zipPath,
    });

    return json({
      ok: true,
      status: "review_required",
      result_object_path: primaryArtifact?.object_path ?? zipPath,
      artifact_count: artifacts.length + 1,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "mineru-poll-hosted-job failed" }, 401);
  }
});

async function extractAndUploadArtifacts(
  admin: {
    storage: {
      from(bucket: string): {
        upload(path: string, body: Uint8Array | string, options: { contentType: string; upsert: boolean }): Promise<{ error: Error | null }>;
      };
    };
  },
  parseJobId: string,
  zipBytes: Uint8Array,
) {
  const zip = await JSZip.loadAsync(zipBytes);
  const rows: { artifact_kind: "markdown" | "json" | "html" | "layout" | "log"; object_path: string; content_preview?: string }[] = [];
  const entries = Object.values(zip.files).filter((entry) => !entry.dir).slice(0, 50);
  for (const entry of entries) {
    const kind = artifactKind(entry.name);
    if (!kind) continue;
    const objectPath = `parse-jobs/${parseJobId}/hosted/${safePath(entry.name)}`;
    const textKind = kind === "markdown" || kind === "json" || kind === "html" || kind === "log";
    const content = textKind ? await entry.async("string") : new Uint8Array(await entry.async("arraybuffer"));
    const { error } = await admin.storage.from("assessment-packages").upload(objectPath, content, {
      contentType: contentTypeForKind(kind),
      upsert: true,
    });
    if (error) throw error;
    rows.push({
      artifact_kind: kind,
      object_path: objectPath,
      content_preview: typeof content === "string" ? content.slice(0, 3000) : undefined,
    });
  }
  return rows;
}

function artifactKind(name: string): "markdown" | "json" | "html" | "layout" | "log" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "log";
  if (lower.includes("layout")) return "layout";
  return null;
}

function contentTypeForKind(kind: "markdown" | "json" | "html" | "layout" | "log") {
  return {
    markdown: "text/markdown",
    json: "application/json",
    html: "text/html",
    layout: "application/octet-stream",
    log: "text/plain",
  }[kind];
}

function safePath(path: string) {
  return path.replace(/^\/+/, "").replaceAll("..", "_").replace(/[^a-zA-Z0-9._/-]/g, "_");
}
