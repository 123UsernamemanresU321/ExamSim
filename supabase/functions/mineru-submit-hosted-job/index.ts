import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit, envInt } from "../_shared/rate-limit.ts";
import {
  buildMineruAuthHeaders,
  buildMineruBatchRequest,
  mineruApiBaseUrl,
  mineruUploadMode,
  normalizeMineruBatchSubmitResponse,
} from "../_shared/mineru-hosted.ts";
import { assertVersionMutable } from "../_shared/version-governance.ts";

type Body = {
  parse_job_id: string;
  force?: boolean;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  let body: Body | null = null;
  let authorizedJobId: string | null = null;
  let failureAdmin: any = null;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    failureAdmin = admin;
    body = await readJson<Body>(request);
    if (!body.parse_job_id) return json(request, { error: "parse_job_id is required" }, 400);
    if (Deno.env.get("MINERU_PROVIDER") !== "hosted") return json(request, { error: "MINERU_PROVIDER must be hosted" }, 500);

    const { data: parseJob, error: parseJobError } = await admin.from("parse_jobs").select("*").eq("id", body.parse_job_id).single();
    if (parseJobError) throw parseJobError;
    assertInstitutionOwner(parseJob.owner_profile_id, ownerProfileId);
    authorizedJobId = parseJob.id;

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("status,assessments!inner(owner_profile_id)")
      .eq("id", parseJob.assessment_version_id)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!version) throw new Error("Assessment version not found");
    const assessment = version.assessments as { owner_profile_id?: string } | null;
    assertInstitutionOwner(assessment?.owner_profile_id, ownerProfileId);
    assertVersionMutable(version.status);

    await enforceRateLimit(admin, {
      scope: "mineru-submit-hosted-job:owner",
      key: ownerProfileId,
      limit: envInt("MINERU_SUBMIT_OWNER_HOURLY_LIMIT", 20),
      windowSeconds: 3600,
    });
    
    const canForceRestart = body.force === true;
    if (!["queued", "failed"].includes(parseJob.status) && !canForceRestart) {
      return json(request, { ok: true, status: parseJob.status, external_batch_id: parseJob.external_batch_id, message: "Parse job is already submitted." });
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
    const { data: signed, error: signedError } = await admin.storage.from("assessment-sources").createSignedUrl(parseJob.source_object_path, 3600);
    if (signedError) throw signedError;
    if (!signed?.signedUrl) throw new Error("Could not sign source PDF URL");
    const signedUrl = signed.signedUrl;

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
        if (!uploadUrl) {
          console.error("MinerU did not return an upload URL. Raw response:", JSON.stringify(submitBody));
          const responseKeys = submitBody && typeof submitBody === "object" ? Object.keys(submitBody).join(", ") : typeof submitBody;
          throw new Error(`MinerU did not return an upload URL. Response keys: ${responseKeys}`);
        }
        
        console.log(`Downloading source PDF from storage: ${parseJob.source_object_path}`);
        const { data: sourceBlob, error: downloadError } = await admin.storage.from("assessment-sources").download(parseJob.source_object_path);
        if (downloadError) throw downloadError;
        if (!sourceBlob) throw new Error("Source PDF could not be downloaded");
        
        const fileBytes = await sourceBlob.arrayBuffer();
        console.log(`Source PDF downloaded (${fileBytes.byteLength} bytes). Uploading to MinerU...`);

        // MinerU docs: PUT must NOT send Content-Type. 
        // Note: Pre-signed URLs (S3/OSS/COS) will fail if we send Authorization or token headers.
        const uploadHeaders: Record<string, string> = {};
        const isPreSigned = /Signature=|AWSAccessKeyId=|OSSAccessKeyId=|AccessKeyId=|Expires=|policy=|security-token=/i.test(uploadUrl);
        
        if (!isPreSigned) {
          const apiKey = Deno.env.get("MINERU_API_KEY");
          if (apiKey) uploadHeaders["Authorization"] = `Bearer ${apiKey}`;
          const accountToken = Deno.env.get("MINERU_ACCOUNT_TOKEN");
          if (accountToken) uploadHeaders["token"] = accountToken;
        }
        
        console.log(`Uploading to ${isPreSigned ? "pre-signed" : "direct"} URL. Headers: ${Object.keys(uploadHeaders).join(", ")}`);
        
        const uploadController = new AbortController();
        const uploadTimeoutId = setTimeout(() => uploadController.abort(), 120000); // 120s for actual upload
        
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
          
          console.log("MinerU upload successful. Triggering extraction task...");
          const triggerResponse = await fetch(`${mineruApiBaseUrl()}/api/v4/extract/task/batch`, {
            method: "POST",
            headers: buildMineruAuthHeaders(),
            body: JSON.stringify(
              buildMineruBatchRequest({
                dataId: parseJob.id,
                signedUrl,
                fileName,
                uploadMode,
                modelVersion,
                isTrigger: true,
              }),
            ),
          });
          const triggerBody = await readMineruJsonResponse(triggerResponse, "MinerU task trigger");
          const triggerSubmission = normalizeMineruBatchSubmitResponse(triggerBody);
          console.log(`MinerU extraction triggered. Final BatchId: ${triggerSubmission.batchId}`);
          
          // Use the final batch ID for tracking
          submission.batchId = triggerSubmission.batchId;
        } catch (uploadError) {
          clearTimeout(uploadTimeoutId);
          if (uploadError instanceof Error && uploadError.name === "AbortError") {
            throw new Error("MinerU file upload timed out (120s limit).");
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
          started_at: now,
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

      await auditOwnerAction(ownerProfileId, user.id, "mineru_hosted.submitted", "parse_jobs", parseJob.id, {
        batch_id: submission.batchId,
        upload_mode: uploadMode,
        force_restart: canForceRestart,
      });

      console.log(`MinerU hosted job submission successful.`);
      return json(request, { ok: true, status: "running", external_batch_id: submission.batchId, upload_mode: uploadMode, restarted: canForceRestart });
    } catch (error) {
      clearTimeout(submitTimeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("MinerU submission request timed out (30s limit).");
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "mineru-submit-hosted-job failed";
    try {
      // If we have a job ID, mark it as failed in the DB so the UI updates
      if (authorizedJobId && failureAdmin) {
        await failureAdmin.from("parse_jobs").update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString()
        }).eq("id", authorizedJobId);
      }
    } catch (dbError) {
      console.error("Failed to update parse job status on error:", dbError);
    }
    return errorResponse(request, error, "mineru-submit-hosted-job failed");
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
