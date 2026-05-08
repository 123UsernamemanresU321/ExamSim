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
  force?: boolean;
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
    
    const canForceRestart = body.force === true;
    if (!["queued", "failed"].includes(parseJob.status) && !canForceRestart) {
      return json({ ok: true, status: parseJob.status, external_batch_id: parseJob.external_batch_id, message: "Parse job is already submitted." });
    }

    if (canForceRestart) {
      // Immediate feedback: mark as queued so UI sees movement
      await admin.from("parse_jobs").update({ 
        status: "queued", 
        error_message: null, 
        external_state: "restarting",
        started_at: new Date().toISOString()
      }).eq("id", parseJob.id);
    }

    const uploadMode = mineruUploadMode();
    const fileName = parseJob.source_object_path.split("/").pop() || `${parseJob.id}.pdf`;
    let signedUrl: string | undefined;
    if (uploadMode === "signed_url") {
      const { data: signed, error: signedError } = await admin.storage.from("assessment-sources").createSignedUrl(parseJob.source_object_path, 600);
      if (signedError) throw signedError;
      if (!signed?.signedUrl) throw new Error("Could not sign source PDF URL");
      signedUrl = signed.signedUrl;
    }

    const modelVersion = Deno.env.get("MINERU_MODEL_VERSION") || "pipeline";
    console.log(`Submitting MinerU job ${parseJob.id} using mode: ${uploadMode}, model: ${modelVersion}`);

    const controller = new AbortController();
    const submitTimeoutId = setTimeout(() => controller.abort(), 30000); // 30s for submission

    try {
      const submitStartTime = Date.now();
      const response = await fetch(`${mineruApiBaseUrl()}${uploadMode === "file_upload" ? "/api/v4/file-urls/batch" : "/api/v4/extract/task/batch"}`, {
        method: "POST",
        headers: buildMineruAuthHeaders(),
        signal: controller.signal,
        body: JSON.stringify(
          buildMineruBatchRequest({
            dataId: parseJob.id,
            signedUrl,
            fileName,
            uploadMode,
            modelVersion,
          }),
        ),
      });
      clearTimeout(submitTimeoutId);
      console.log(`MinerU batch response received in ${Date.now() - submitStartTime}ms. Status: ${response.status}`);
      
      const submitBody = await readMineruJsonResponse(response, "MinerU submission");
      const submission = normalizeMineruBatchSubmitResponse(submitBody);
      console.log(`MinerU submission normalized. BatchId: ${submission.batchId}, TraceId: ${submission.traceId}`);

      if (uploadMode === "file_upload") {
        const uploadUrl = submission.uploadUrls[0];
        if (!uploadUrl) throw new Error("MinerU did not return an upload URL");
        
        console.log(`Downloading source PDF from storage: ${parseJob.source_object_path}`);
        const { data: sourceBlob, error: downloadError } = await admin.storage.from("assessment-sources").download(parseJob.source_object_path);
        if (downloadError) throw downloadError;
        if (!sourceBlob) throw new Error("Source PDF could not be downloaded");
        
        const fileBytes = await sourceBlob.arrayBuffer();
        console.log(`Source PDF downloaded (${fileBytes.byteLength} bytes). Uploading to MinerU...`);

        // MinerU docs: PUT requires Authorization header, must NOT send Content-Type
        const apiKey = Deno.env.get("MINERU_API_KEY");
        const uploadHeaders: Record<string, string> = {};
        if (apiKey) uploadHeaders["Authorization"] = `Bearer ${apiKey}`;
        const accountToken = Deno.env.get("MINERU_ACCOUNT_TOKEN");
        if (accountToken) uploadHeaders["token"] = accountToken;
        
        const uploadController = new AbortController();
        const uploadTimeoutId = setTimeout(() => uploadController.abort(), 90000); // 90s for actual upload
        
        const uploadStartTime = Date.now();
        try {
          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: uploadHeaders,
            body: fileBytes,
            signal: uploadController.signal,
          });
          clearTimeout(uploadTimeoutId);
          console.log(`MinerU upload response received in ${Date.now() - uploadStartTime}ms. Status: ${uploadResponse.status}`);
          
          if (!uploadResponse.ok) {
            const uploadErrText = await uploadResponse.text().catch(() => "");
            throw new Error(`MinerU upload URL rejected source PDF: ${uploadResponse.status} ${uploadErrText.slice(0, 300)}`);
          }
        } catch (uploadError) {
          clearTimeout(uploadTimeoutId);
          if (uploadError instanceof Error && uploadError.name === "AbortError") {
            throw new Error("MinerU file upload timed out (90s limit). If this persists, check network or file size.");
          }
          throw uploadError;
        }
      }

      const now = new Date().toISOString();
      const metadata = {
        ...(parseJob.metadata_json ?? {}),
        hosted_submit_trace_id: submission.traceId,
        upload_mode: uploadMode,
        restarted_from_batch_id: canForceRestart ? parseJob.external_batch_id : undefined,
        restarted_at: canForceRestart ? now : undefined,
        model_version: modelVersion,
        language: Deno.env.get("MINERU_LANGUAGE") || "en",
      };
      
      console.log(`Updating parse job status to running...`);
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
        force_restart: canForceRestart,
      });

      console.log(`MinerU hosted job submission successful.`);
      return json({ ok: true, status: "running", external_batch_id: submission.batchId, upload_mode: uploadMode, restarted: canForceRestart });
    } catch (error) {
      clearTimeout(submitTimeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("MinerU submission request timed out (30s limit).");
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "mineru-submit-hosted-job failed";
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

function statusForMineruError(message: string) {
  if (/MFA|AAL2|Owner role|Forbidden|bearer token/i.test(message)) return 403;
  if (/required|not configured|must be hosted|not submitted|invalid|rejected|PDF/i.test(message)) return 400;
  if (/MinerU .*failed: 4\d\d/i.test(message)) return 502;
  return 500;
}
