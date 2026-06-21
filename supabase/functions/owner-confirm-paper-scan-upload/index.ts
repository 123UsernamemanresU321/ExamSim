import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, assertInstitutionOwner, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { MAX_PAPER_SCAN_BYTES, verifyPrivatePdfUpload } from "../_shared/pdf-upload.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, profile, admin, ownerProfileId } = await requireInstitutionAal2(request, "marking");
    const body = await readJson<{ paper_mode_job_id?: string; object_path?: string; file_name?: string }>(request);
    const jobId = String(body.paper_mode_job_id ?? "").trim();
    const objectPath = String(body.object_path ?? "").trim();
    if (!jobId || !objectPath) return json(request, { error: "paper_mode_job_id and object_path are required" }, 400);
    const expectedPrefix = `${ownerProfileId}/paper-jobs/${jobId}/scans/`;
    if (!objectPath.startsWith(expectedPrefix) || !objectPath.endsWith(".pdf") || objectPath.includes("..")) {
      return json(request, { error: "Invalid Paper Mode scan path" }, 400);
    }
    const { data: job, error: jobError } = await admin.from("paper_mode_jobs").select("id,owner_profile_id,status").eq("id", jobId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) return json(request, { error: "Paper Mode job not found" }, 404);
    assertInstitutionOwner(job.owner_profile_id, ownerProfileId);
    if (job.status === "archived" || job.status === "completed") {
      return json(request, { error: "This Paper Mode job no longer accepts scans" }, 409);
    }
    const { data: existing, error: existingError } = await admin.from("paper_mode_scans").select("id,page_count,status").eq("object_path", objectPath).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return json(request, { ok: true, scan: existing, idempotent: true });
    const verified = await verifyPrivatePdfUpload(admin, "paper-scans", objectPath, MAX_PAPER_SCAN_BYTES);
    const { data: scan, error: scanError } = await admin.from("paper_mode_scans").insert({
      paper_mode_job_id: job.id,
      object_path: objectPath,
      original_file_name: sanitizeFileName(body.file_name),
      file_size_bytes: verified.byteLength,
      page_count: verified.pageCount,
      status: "needs_mapping",
      mapping_confidence: null,
      uploaded_by_profile_id: profile.id,
    }).select("id,page_count,status").single();
    if (scanError) throw scanError;
    if (!scan) throw new Error("Paper scan record could not be created");
    const pageCount = verified.pageCount ?? 1;
    const { error: pagesError } = await admin.from("paper_mode_scan_pages").insert(Array.from({ length: pageCount }, (_, index) => ({ paper_mode_scan_id: scan.id, page_number: index + 1, mapping_status: "unmapped" })));
    if (pagesError) throw pagesError;
    const { error: jobUpdateError } = await admin.from("paper_mode_jobs").update({ status: "mapping", updated_at: new Date().toISOString() }).eq("id", job.id).eq("owner_profile_id", ownerProfileId);
    if (jobUpdateError) throw jobUpdateError;
    await auditOwnerAction(ownerProfileId, user.id, "paper_mode.scan_confirmed", "paper_mode_scans", scan.id, { paper_mode_job_id: job.id, page_count: verified.pageCount, file_size_bytes: verified.byteLength });
    return json(request, { ok: true, scan, file_size_bytes: verified.byteLength, page_count: verified.pageCount, needs_manual_page_count_review: verified.pageCount == null });
  } catch (error) {
    return errorResponse(request, error, "paper scan confirmation failed");
  }
});

function sanitizeFileName(value: unknown) {
  if (typeof value !== "string") return null;
  return value.replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 255) || null;
}
