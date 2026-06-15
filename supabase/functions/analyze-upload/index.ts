import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { estimatePdfPageCount, hasPdfMagicBytes } from "../_shared/pdf-upload.ts";

type Body = {
  upload_slot_id: string;
  object_path?: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.upload_slot_id) return json(request, { error: "upload_slot_id is required" }, 400);

    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("*, attempts(id, assignee_profile_id, upload_deadline_at_utc)")
      .eq("id", body.upload_slot_id)
      .single();
    if (slotError) throw slotError;
    const attempt = Array.isArray(slot.attempts) ? slot.attempts[0] : slot.attempts;
    if (profile.app_role !== "owner" && attempt?.assignee_profile_id !== profile.id) return json(request, { error: "Forbidden" }, 403);

    const objectPath = body.object_path ?? slot.object_path;
    const fileName = slot.original_file_name ?? objectPath?.split("/").pop() ?? null;
    const warnings: Array<{ code: string; severity: string; message: string }> = [];
    let pageCount: number | null = null;
    let hash: string | null = null;
    let renderable = true;

    if (!objectPath) {
      warnings.push({ code: "missing_object_path", severity: "high", message: "No uploaded PDF object is attached to this slot." });
      renderable = false;
    } else {
      try {
        const { data, error } = await admin.storage.from("answer-uploads").download(objectPath);
        if (error) throw error;
        const bytes = new Uint8Array(await data.arrayBuffer());
        if (!hasPdfMagicBytes(bytes)) warnings.push({ code: "not_pdf_magic", severity: "high", message: "The uploaded object does not have a PDF header." });
        pageCount = estimatePdfPageCount(bytes);
        hash = await sha256Hex(bytes);
        if (!pageCount || pageCount <= 0) warnings.push({ code: "page_count_unknown", severity: "medium", message: "The Edge fallback could not confirm the page count." });
      } catch (_error) {
        renderable = false;
        warnings.push({ code: "download_or_render_failed", severity: "high", message: "The uploaded PDF could not be opened from private Storage." });
      }
    }

    if (slot.content_type && slot.content_type !== "application/pdf") warnings.push({ code: "not_pdf", severity: "high", message: "The confirmed upload is not a PDF." });
    if (typeof slot.file_size_bytes === "number" && slot.file_size_bytes < 5000) warnings.push({ code: "very_small_file", severity: "medium", message: "The uploaded PDF is unusually small." });
    if (typeof slot.file_size_bytes === "number" && slot.file_size_bytes > 10 * 1024 * 1024) warnings.push({ code: "too_large", severity: "high", message: "The uploaded PDF exceeds the 10MB limit." });

    const duplicateCount = hash
      ? await countDuplicateHash(admin, slot.attempt_id, hash)
      : 0;
    if (duplicateCount > 0) warnings.push({ code: "duplicate_file", severity: "medium", message: "The same PDF appears on another upload slot in this attempt." });

    const status = warnings.some((warning) => warning.severity === "high")
      ? "failed"
      : warnings.some((warning) => warning.severity === "medium")
        ? "needs_review"
        : warnings.length
          ? "accepted_with_warnings"
          : "accepted";

    const { data: saved, error: saveError } = await admin
      .from("upload_sanity_checks")
      .insert({
        upload_slot_id: slot.id,
        status,
        file_name: fileName,
        file_size_bytes: slot.file_size_bytes,
        file_hash: hash,
        content_type: slot.content_type ?? "application/pdf",
        page_count: pageCount,
        warnings_json: warnings,
        checks_json: {
          renderable,
          duplicate_file_hash_count: duplicateCount,
          edge_analysis: "metadata_plus_pdf_page_token_scan",
        },
      })
      .select("*")
      .single();
    if (saveError) throw saveError;

    return json(request, { status, page_count: pageCount, warnings, check: saved });
  } catch (error) {
    return errorResponse(request, error, "analyze-upload failed");
  }
});

async function sha256Hex(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function countDuplicateHash(admin: any, attemptId: string, hash: string) {
  const { data, error } = await admin
    .from("upload_sanity_checks")
    .select("id, upload_slots!inner(attempt_id)")
    .eq("file_hash", hash)
    .eq("upload_slots.attempt_id", attemptId);
  if (error) return 0;
  return data?.length ?? 0;
}
