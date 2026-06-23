import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { MAX_PAPER_SCAN_BYTES, verifyPrivatePdfUpload } from "../_shared/pdf-upload.ts";

const MATERIAL_TYPES = new Set(["formula_booklet", "data_booklet", "annex", "instructions", "reference", "other"]);

type Body = {
  object_path?: string;
  title?: string;
  material_type?: string;
  subject?: string;
  level?: string;
  version_label?: string;
  language_code?: string;
  replaces_resource_id?: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, profile, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    const body = await readJson<Body>(request);
    const objectPath = String(body.object_path ?? "").trim();
    const title = clean(body.title, 180);
    const materialType = String(body.material_type ?? "").trim();
    if (!objectPath || !title || !MATERIAL_TYPES.has(materialType)) {
      return json(request, { error: "object_path, title, and a valid material_type are required" }, 400);
    }
    const expectedPrefix = `${ownerProfileId}/resources/`;
    if (!objectPath.startsWith(expectedPrefix) || !objectPath.endsWith(".pdf") || objectPath.includes("..")) {
      return json(request, { error: "Invalid resource path" }, 400);
    }

    const { data: byPath, error: byPathError } = await admin
      .from("resource_library_items")
      .select("id,title,material_type,subject,level,version_label,language_code,file_size_bytes,page_count,status")
      .eq("object_path", objectPath)
      .maybeSingle();
    if (byPathError) throw byPathError;
    if (byPath) return json(request, { ok: true, resource: byPath, idempotent: true });

    const verified = await verifyPrivatePdfUpload(admin, "assessment-resources", objectPath, MAX_PAPER_SCAN_BYTES);
    const { data: duplicate, error: duplicateError } = await admin
      .from("resource_library_items")
      .select("id,title,material_type,subject,level,version_label,language_code,file_size_bytes,page_count,status")
      .eq("owner_profile_id", ownerProfileId)
      .eq("sha256", verified.sha256)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) {
      await admin.storage.from("assessment-resources").remove([objectPath]);
      return json(request, { ok: true, resource: duplicate, duplicate: true });
    }

    const replacesResourceId = clean(body.replaces_resource_id, 80);
    if (replacesResourceId) {
      const { data: replaced, error: replacedError } = await admin
        .from("resource_library_items")
        .select("id,owner_profile_id")
        .eq("id", replacesResourceId)
        .maybeSingle();
      if (replacedError) throw replacedError;
      if (!replaced || replaced.owner_profile_id !== ownerProfileId) return json(request, { error: "Replacement resource not found" }, 404);
    }

    const { data: resource, error: insertError } = await admin.from("resource_library_items").insert({
      owner_profile_id: ownerProfileId,
      title,
      material_type: materialType,
      subject: clean(body.subject, 100),
      level: clean(body.level, 80),
      version_label: clean(body.version_label, 80),
      language_code: clean(body.language_code, 12) || "en",
      object_path: objectPath,
      sha256: verified.sha256,
      file_size_bytes: verified.byteLength,
      page_count: verified.pageCount,
      content_type: verified.contentType,
      replaces_resource_id: replacesResourceId,
      created_by_profile_id: profile.id,
    }).select("id,title,material_type,subject,level,version_label,language_code,file_size_bytes,page_count,status").single();
    if (insertError) throw insertError;
    if (replacesResourceId) {
      const { error: archiveError } = await admin.from("resource_library_items")
        .update({ status: "replaced", updated_at: new Date().toISOString() })
        .eq("id", replacesResourceId)
        .eq("owner_profile_id", ownerProfileId);
      if (archiveError) throw archiveError;
    }
    await auditOwnerAction(ownerProfileId, user.id, "resource_library.upload_confirmed", "resource_library_items", resource.id, {
      sha256: verified.sha256,
      file_size_bytes: verified.byteLength,
      page_count: verified.pageCount,
      material_type: materialType,
    });
    return json(request, {
      ok: true,
      resource,
      file_size_bytes: verified.byteLength,
      page_count: verified.pageCount,
      needs_page_count_review: verified.pageCount == null,
    });
  } catch (error) {
    return errorResponse(request, error, "resource upload confirmation failed");
  }
});

function clean(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}
