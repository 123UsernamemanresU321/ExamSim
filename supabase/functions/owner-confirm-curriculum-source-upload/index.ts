import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { MAX_PAPER_SCAN_BYTES, verifyPrivatePdfUpload } from "../_shared/pdf-upload.ts";

type Body = {
  object_path?: string;
  title?: string;
  subject?: string;
  programme_component?: "subject" | "core";
  version_label?: string;
  language_code?: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, profile, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    const body = await readJson<Body>(request);
    const objectPath = clean(body.object_path, 500);
    const title = clean(body.title, 220);
    const component = body.programme_component === "core" ? "core" : "subject";
    if (!objectPath || !title) return json(request, { error: "object_path and title are required" }, 400);
    if (!objectPath.startsWith(`${ownerProfileId}/curriculum/`) || !objectPath.endsWith(".pdf") || objectPath.includes("..")) {
      return json(request, { error: "Invalid curriculum source path" }, 400);
    }

    const { data: byPath, error: byPathError } = await admin.from("curriculum_source_documents")
      .select("id,title,status,page_count,subject,programme_component,version_label")
      .eq("object_path", objectPath)
      .maybeSingle();
    if (byPathError) throw byPathError;
    if (byPath) return json(request, { ok: true, source: byPath, idempotent: true });

    const verified = await verifyPrivatePdfUpload(admin, "curriculum-sources", objectPath, MAX_PAPER_SCAN_BYTES);
    const { data: duplicate, error: duplicateError } = await admin.from("curriculum_source_documents")
      .select("id,title,status,page_count,subject,programme_component,version_label")
      .eq("owner_profile_id", ownerProfileId)
      .eq("sha256", verified.sha256)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) {
      await admin.storage.from("curriculum-sources").remove([objectPath]);
      return json(request, { ok: true, source: duplicate, duplicate: true });
    }

    const { data: source, error: sourceError } = await admin.from("curriculum_source_documents").insert({
      owner_profile_id: ownerProfileId,
      title,
      subject: clean(body.subject, 100),
      programme_component: component,
      version_label: clean(body.version_label, 80),
      language_code: clean(body.language_code, 12) || "en",
      object_path: objectPath,
      sha256: verified.sha256,
      file_size_bytes: verified.byteLength,
      page_count: verified.pageCount,
      status: "needs_review",
      created_by_profile_id: profile.id,
    }).select("id,title,status,page_count,subject,programme_component,version_label").single();
    if (sourceError) throw sourceError;
    const { data: job, error: jobError } = await admin.from("curriculum_import_jobs").insert({
      owner_profile_id: ownerProfileId,
      source_document_id: source.id,
      provider: "manual_review",
      status: "needs_review",
      progress_percent: 100,
      result_summary_json: {
        message: "Source verified. Add concise guide-derived nodes in the review queue; no guide text is published automatically.",
      },
      created_by_profile_id: profile.id,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).select("id,status").single();
    if (jobError) throw jobError;
    await auditOwnerAction(ownerProfileId, user.id, "curriculum_source.upload_confirmed", "curriculum_source_documents", source.id, {
      sha256: verified.sha256,
      file_size_bytes: verified.byteLength,
      page_count: verified.pageCount,
      import_job_id: job.id,
    });
    return json(request, { ok: true, source, import_job: job });
  } catch (error) {
    return errorResponse(request, error, "curriculum source upload confirmation failed");
  }
});

function clean(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}
