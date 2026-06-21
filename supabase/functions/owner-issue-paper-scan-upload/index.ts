import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, assertInstitutionOwner, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "marking");
    const body = await readJson<{ paper_mode_job_id?: string }>(request);
    const jobId = String(body.paper_mode_job_id ?? "").trim();
    if (!jobId) return json(request, { error: "paper_mode_job_id is required" }, 400);
    await enforceRateLimit(admin, { scope: "owner-issue-paper-scan-upload", key: ownerProfileId, limit: 60, windowSeconds: 3600 });
    const { data: job, error: jobError } = await admin.from("paper_mode_jobs").select("id,owner_profile_id,status").eq("id", jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) return json(request, { error: "Paper Mode job not found" }, 404);
    assertInstitutionOwner(job.owner_profile_id, ownerProfileId);
    if (job.status === "archived" || job.status === "completed") return json(request, { error: "This Paper Mode job no longer accepts scans" }, 409);
    const objectPath = `${ownerProfileId}/paper-jobs/${job.id}/scans/${crypto.randomUUID()}.pdf`;
    const { data, error } = await admin.storage.from("paper-scans").createSignedUploadUrl(objectPath);
    if (error) throw error;
    await auditOwnerAction(ownerProfileId, user.id, "paper_mode.scan_upload_issued", "paper_mode_jobs", job.id, { object_path: objectPath });
    return json(request, { bucket: "paper-scans", object_path: objectPath, upload_token: data.token, max_file_size_bytes: 50 * 1024 * 1024 });
  } catch (error) {
    return errorResponse(request, error, "paper scan upload issue failed");
  }
});
