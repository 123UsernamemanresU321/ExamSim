import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

type ReviewBody = {
  result_id?: string;
  status?: "approved" | "rejected";
  corrected_text?: string | null;
  corrected_latex?: string | null;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { user, profile, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    const body = await readJson<ReviewBody>(request);
    const resultId = String(body.result_id ?? "").trim();
    if (!resultId) return json(request, { error: "OCR result is required" }, 400);
    if (body.status !== "approved" && body.status !== "rejected") {
      return json(request, { error: "Review status must be approved or rejected" }, 400);
    }

    const correctedText = normalizeCorrection(body.corrected_text, 80_000, "OCR text");
    const correctedLatex = normalizeCorrection(body.corrected_latex, 80_000, "OCR LaTeX");
    if (body.status === "approved" && !correctedText && !correctedLatex) {
      return json(request, { error: "Approved OCR must contain corrected text or LaTeX" }, 400);
    }

    await enforceRateLimit(admin, {
      scope: "review-ocr-result:owner",
      key: ownerProfileId,
      limit: 300,
      windowSeconds: 3600,
    });

    const { data: existing, error: existingError } = await admin
      .from("ocr_provider_results")
      .select("*,source_documents!inner(owner_profile_id)")
      .eq("id", resultId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw new Error("OCR result not found");
    const sourceDocument = existing.source_documents as { owner_profile_id?: string } | null;
    assertInstitutionOwner(sourceDocument?.owner_profile_id, ownerProfileId);

    const previousMetadata = safeRecord(existing.provider_payload_json);
    const { data: reviewed, error: updateError } = await admin
      .from("ocr_provider_results")
      .update({
        status: body.status,
        extracted_text: body.status === "approved" ? correctedText : existing.extracted_text,
        extracted_latex: body.status === "approved" ? correctedLatex : existing.extracted_latex,
        reviewed_by_profile_id: profile.id,
        reviewed_at: new Date().toISOString(),
        provider_payload_json: {
          ...previousMetadata,
          original_extracted_text: previousMetadata.original_extracted_text ?? existing.extracted_text,
          original_extracted_latex: previousMetadata.original_extracted_latex ?? existing.extracted_latex,
          correction_applied: body.status === "approved",
        },
      })
      .eq("id", resultId)
      .eq("owner_profile_id", ownerProfileId)
      .select("id,status,confidence,extracted_text,extracted_latex,provider_request_id,reviewed_at")
      .single();
    if (updateError) throw updateError;

    await auditOwnerAction(ownerProfileId, user.id, "ocr_result.reviewed", "ocr_provider_results", resultId, {
      review_status: body.status,
      corrected_text: body.status === "approved" && correctedText !== existing.extracted_text,
      corrected_latex: body.status === "approved" && correctedLatex !== existing.extracted_latex,
      source_page_id: existing.source_page_id,
      source_region_id: existing.source_region_id,
    });

    return json(request, { ok: true, result: reviewed });
  } catch (error) {
    return errorResponse(request, error, "OCR result review failed");
  }
});

function normalizeCorrection(value: string | null | undefined, maxLength: number, label: string) {
  const normalized = String(value ?? "").trim();
  if (normalized.length > maxLength) throw new Error(`${label} is too long`);
  return normalized || null;
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
