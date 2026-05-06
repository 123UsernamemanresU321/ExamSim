import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
import {
  buildMineruAuthHeaders,
  buildMineruBatchRequest,
  mineruApiBaseUrl,
  mineruUploadMode,
  normalizeMineruBatchSubmitResponse,
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
    if (Deno.env.get("MINERU_PROVIDER") !== "hosted") return json({ error: "MINERU_PROVIDER must be hosted" }, 500);

    const { data: parseJob, error: parseJobError } = await admin.from("parse_jobs").select("*").eq("id", body.parse_job_id).single();
    if (parseJobError) throw parseJobError;
    if (parseJob.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);
    if (!["queued", "failed"].includes(parseJob.status)) {
      return json({ ok: true, status: parseJob.status, external_batch_id: parseJob.external_batch_id, message: "Parse job is already submitted." });
    }

    const uploadMode = mineruUploadMode();
    const fileName = parseJob.source_object_path.split("/").pop() || `${parseJob.id}.pdf`;
    const { data: signed, error: signedError } = await admin.storage.from("assessment-sources").createSignedUrl(parseJob.source_object_path, 600);
    if (signedError) throw signedError;
    if (!signed?.signedUrl) throw new Error("Could not sign source PDF URL");

    const response = await fetch(`${mineruApiBaseUrl()}${uploadMode === "file_upload" ? "/api/v4/file-urls/batch" : "/api/v4/extract/task/batch"}`, {
      method: "POST",
      headers: buildMineruAuthHeaders(),
      body: JSON.stringify(
        buildMineruBatchRequest({
          dataId: parseJob.id,
          signedUrl: signed.signedUrl,
          fileName,
          uploadMode,
        }),
      ),
    });
    const submitBody = await response.json();
    if (!response.ok) throw new Error(`MinerU submission failed: ${response.status}`);
    const submission = normalizeMineruBatchSubmitResponse(submitBody);

    if (uploadMode === "file_upload") {
      const uploadUrl = submission.uploadUrls[0];
      if (!uploadUrl) throw new Error("MinerU did not return an upload URL");
      const { data: sourceBlob, error: downloadError } = await admin.storage.from("assessment-sources").download(parseJob.source_object_path);
      if (downloadError) throw downloadError;
      if (!sourceBlob) throw new Error("Source PDF could not be downloaded");
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: await sourceBlob.arrayBuffer(),
      });
      if (!uploadResponse.ok) throw new Error(`MinerU upload URL rejected source PDF: ${uploadResponse.status}`);
    }

    const now = new Date().toISOString();
    const metadata = {
      ...(parseJob.metadata_json ?? {}),
      hosted_submit_trace_id: submission.traceId,
      upload_mode: uploadMode,
      model_version: Deno.env.get("MINERU_MODEL_VERSION") || "vlm",
      language: Deno.env.get("MINERU_LANGUAGE") || "en",
    };
    const { error: updateError } = await admin
      .from("parse_jobs")
      .update({
        parser: "mineru_hosted",
        status: "running",
        started_at: parseJob.started_at ?? now,
        completed_at: null,
        error_message: null,
        external_provider: "mineru_hosted",
        external_batch_id: submission.batchId,
        external_data_id: parseJob.id,
        external_state: "submitted",
        metadata_json: metadata,
      })
      .eq("id", parseJob.id);
    if (updateError) throw updateError;

    await auditOwnerAction(ownerProfile.id, user.id, "mineru_hosted.submitted", "parse_jobs", parseJob.id, {
      batch_id: submission.batchId,
      upload_mode: uploadMode,
    });

    return json({ ok: true, status: "running", external_batch_id: submission.batchId, upload_mode: uploadMode });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "mineru-submit-hosted-job failed" }, 401);
  }
});
