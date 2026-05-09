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

    console.log(`Polling MinerU job result for batch: ${parseJob.external_batch_id}`);
    
    const pollController = new AbortController();
    const pollTimeoutId = setTimeout(() => pollController.abort(), 30000); // 30s for lookup

    let resultResponse: Response;
    try {
      const pollStartTime = Date.now();
      resultResponse = await fetch(`${mineruApiBaseUrl()}/api/v4/extract-results/batch/${parseJob.external_batch_id}`, {
        method: "GET",
        headers: buildMineruAuthHeaders(),
        signal: pollController.signal,
      });
      clearTimeout(pollTimeoutId);
      console.log(`MinerU poll response received in ${Date.now() - pollStartTime}ms. Status: ${resultResponse.status}`);
    } catch (pollError) {
      clearTimeout(pollTimeoutId);
      if (pollError instanceof Error && pollError.name === "AbortError") {
        throw new Error("MinerU result lookup timed out (30s limit).");
      }
      throw pollError;
    }

    let rawResult: unknown;
    try {
      rawResult = await readMineruJsonResponse(resultResponse, "MinerU result lookup");
    } catch (error) {
      const message = error instanceof Error ? error.message : "MinerU result lookup failed";
      await admin
        .from("parse_jobs")
        .update({
          status: "failed",
          external_state: "provider_error",
          error_message: message,
          completed_at: new Date().toISOString(),
          metadata_json: { ...(parseJob.metadata_json ?? {}), last_mineru_poll_error: message },
        })
        .eq("id", parseJob.id);
      return json({ ok: false, status: "failed", external_state: "provider_error", error_message: message }, statusForMineruError(message));
    }
    
    let result: MineruExtractResult;
    try {
      result = pickMineruExtractResult(rawResult, parseJob.external_data_id ?? parseJob.id);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : "Failed to parse MinerU result";
      await admin
        .from("parse_jobs")
        .update({
          status: "failed",
          external_state: "parse_error",
          error_message: message,
          completed_at: new Date().toISOString(),
          metadata_json: { ...(parseJob.metadata_json ?? {}), last_mineru_poll_error: message, raw_result: rawResult },
        })
        .eq("id", parseJob.id);
      return json({ ok: false, status: "failed", external_state: "parse_error", error_message: message }, 500);
    }

    if (result.state !== "done") {
      const staleError = staleMineruError(parseJob);
      const status = result.state === "failed" || result.state === "unknown" || staleError ? "failed" : "running";
      const errorMessage = staleError ?? result.error ?? (result.state === "unknown" ? "MinerU returned an unknown result state." : null);
      
      console.log(`MinerU job ${parseJob.id} is ${status}. Provider state: ${result.state}`);
      const { error: updateError } = await admin
        .from("parse_jobs")
        .update({
          status,
          external_state: result.state,
          error_message: errorMessage,
          completed_at: status === "failed" ? new Date().toISOString() : null,
          metadata_json: { ...(parseJob.metadata_json ?? {}), last_mineru_result: result.raw },
        })
        .eq("id", parseJob.id);
      if (updateError) throw updateError;
      return json({ ok: status !== "failed", status, external_state: result.state, error_message: errorMessage });
    }

    try {
      if (!result.fullZipUrl) throw new Error("MinerU result is done but did not include full_zip_url");
      
      console.log(`MinerU job done. Downloading result ZIP: ${result.fullZipUrl}`);
      const zipController = new AbortController();
      const zipTimeoutId = setTimeout(() => zipController.abort(), 90000); // 90s for zip download
      
      let zipResponse: Response;
      try {
        const zipStartTime = Date.now();
        zipResponse = await fetch(result.fullZipUrl, { signal: zipController.signal });
        clearTimeout(zipTimeoutId);
        if (!zipResponse.ok) throw new Error(`Could not download MinerU result ZIP: ${zipResponse.status}`);
        console.log(`MinerU ZIP download response received in ${Date.now() - zipStartTime}ms.`);
      } catch (zipError) {
        clearTimeout(zipTimeoutId);
        if (zipError instanceof Error && zipError.name === "AbortError") {
          throw new Error("MinerU result ZIP download timed out (90s limit).");
        }
        throw zipError;
      }
      
      const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
      console.log(`Result ZIP downloaded (${zipBytes.byteLength} bytes). Processing artifacts...`);
      
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
        ...artifacts.map((a) => ({ ...a, parse_job_id: parseJob.id })),
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
    } catch (processError) {
      console.error("Processing MinerU result failed:", processError);
      let message = "Unknown processing error";
      if (processError instanceof Error) {
        message = processError.message;
      } else if (typeof processError === "object" && processError !== null) {
        try {
          message = JSON.stringify(processError);
        } catch (_) {
          message = String(processError);
        }
      } else {
        message = String(processError);
      }
      
      await admin
        .from("parse_jobs")
        .update({
          status: "failed",
          external_state: "provider_error",
          error_message: `Extraction failed: ${message.slice(0, 500)}`,
          completed_at: new Date().toISOString(),
          metadata_json: { 
            ...(parseJob.metadata_json ?? {}), 
            last_mineru_result: result.raw, 
            process_error: message,
            process_error_stack: processError instanceof Error ? processError.stack : undefined,
            full_zip_url: result.fullZipUrl
          },
        })
        .eq("id", parseJob.id);
      return json({ ok: false, status: "failed", external_state: "provider_error", error_message: message }, 500);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "mineru-poll-hosted-job failed";
    return json({ error: message }, statusForMineruError(message));
  }
});

async function readMineruJsonResponse(response: Response, label: string) {
  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error(`${label} response reading timed out`)), 10000)
  );
  
  const textPromise = response.text();
  const text = await Promise.race([textPromise, timeoutPromise]);

  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_error) {
    if (!response.ok) throw new Error(`${label} failed: ${response.status} ${text.slice(0, 300)}`);
    throw new Error(`${label} returned invalid JSON`);
  }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new Error(`${label} failed: ${response.status} ${String(record.msg ?? record.error ?? record.message ?? "").slice(0, 300)}`.trim());
  }
  return payload;
}

function staleMineruError(parseJob: { started_at?: string | null; updated_at?: string | null; created_at?: string | null; metadata_json?: Record<string, unknown> | null }) {
  const staleAfterSeconds = Number(Deno.env.get("MINERU_STALE_AFTER_SECONDS") || 45 * 60);
  const startedAt = Date.parse(parseJob.started_at ?? parseJob.updated_at ?? parseJob.created_at ?? "");
  if (!Number.isFinite(startedAt)) return null;
  const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsedSeconds < staleAfterSeconds) return null;
  const uploadMode = typeof parseJob.metadata_json?.upload_mode === "string" ? parseJob.metadata_json.upload_mode : "unknown";
  return `MinerU has not completed after ${Math.round(elapsedSeconds / 60)} minutes. The job was marked failed so it can be restarted; server-side file upload mode is recommended over signed URL mode. Last upload mode: ${uploadMode}.`;
}

function statusForMineruError(message: string) {
  if (/MFA|AAL2|Owner role|Forbidden|bearer token/i.test(message)) return 403;
  if (/required|not configured|not submitted|invalid/i.test(message)) return 400;
  if (/MinerU .*failed: 4\d\d|provider_error/i.test(message)) return 502;
  return 500;
}

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
  
  // Sort entries to process important files first (MD, JSON) and limit to 50
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .sort((a, b) => {
      const aKind = artifactKind(a.name);
      const bKind = artifactKind(b.name);
      if (aKind === "markdown" || aKind === "json") return -1;
      if (bKind === "markdown" || bKind === "json") return 1;
      return 0;
    })
    .slice(0, 50);
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
      content_preview: typeof content === "string" ? content.slice(0, 16000) : undefined,
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
