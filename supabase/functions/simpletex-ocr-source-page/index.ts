import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import md5 from "https://esm.sh/blueimp-md5@2.19.0";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit, requestIpKey } from "../_shared/rate-limit.ts";

type SimpleTexMode = "formula" | "formula_fast" | "general" | "document";

const MODE_ENDPOINTS: Record<SimpleTexMode, string> = {
  formula: "https://server.simpletex.net/api/latex_ocr",
  formula_fast: "https://server.simpletex.net/api/latex_ocr_turbo",
  general: "https://server.simpletex.net/api/simpletex_ocr",
  document: "https://server.simpletex.net/api/doc_ocr",
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const context = await requireInstitutionAal2(request, "assessment_authoring");
    const { user, admin, ownerProfileId } = context;
    const appId = Deno.env.get("SIMPLETEX_APP_ID")?.trim();
    const appSecret = Deno.env.get("SIMPLETEX_APP_SECRET")?.trim();
    if (!appId || !appSecret) throw new Error("SimpleTeX APP credentials are not configured");

    const body = await readJson<{
      source_page_id?: string;
      source_region_id?: string | null;
      mode?: SimpleTexMode;
    }>(request);
    const sourcePageId = String(body.source_page_id ?? "").trim();
    const mode = body.mode && body.mode in MODE_ENDPOINTS ? body.mode : "document";
    if (!sourcePageId) return json(request, { error: "Source page is required" }, 400);

    await enforceRateLimit(admin, {
      scope: "simpletex-ocr:ip",
      key: requestIpKey(request),
      limit: 60,
      windowSeconds: 3600,
    });
    await enforceRateLimit(admin, {
      scope: "simpletex-ocr:owner",
      key: ownerProfileId,
      limit: 200,
      windowSeconds: 3600,
    });

    const { data: sourcePage, error: pageError } = await admin
      .from("source_pages")
      .select("id,source_document_id,image_object_path,source_documents!inner(id,owner_profile_id)")
      .eq("id", sourcePageId)
      .maybeSingle();
    if (pageError) throw pageError;
    const sourceDocument = sourcePage?.source_documents as { id?: string; owner_profile_id?: string } | null;
    if (!sourcePage) throw new Error("Source page not found");
    assertInstitutionOwner(sourceDocument?.owner_profile_id, ownerProfileId);
    if (!sourcePage.image_object_path) {
      throw new Error("This source page has no private rendered image. Render the PDF page or use manual region editing.");
    }

    if (body.source_region_id) {
      const { data: region, error: regionError } = await admin
        .from("question_source_regions")
        .select("id,source_page_id,source_document_id")
        .eq("id", body.source_region_id)
        .eq("source_page_id", sourcePage.id)
        .eq("source_document_id", sourcePage.source_document_id)
        .maybeSingle();
      if (regionError) throw regionError;
      if (!region) throw new Error("Source region does not belong to this page");
    }

    const { data: imageBlob, error: downloadError } = await admin.storage
      .from("assessment-packages")
      .download(sourcePage.image_object_path);
    if (downloadError) throw downloadError;
    if (!imageBlob || imageBlob.size === 0 || imageBlob.size > 12 * 1024 * 1024) {
      throw new Error("Source page image is empty or too large for OCR");
    }

    const form = new FormData();
    const signedFields: Record<string, string> = {};
    if (mode === "general") {
      signedFields.rec_mode = "auto";
      signedFields.enable_img_rot = "true";
    }
    if (mode === "document") {
      signedFields.inline_formula_wrapper = '["$","$"]';
      signedFields.isolated_formula_wrapper = '["$$","$$"]';
    }
    for (const [key, value] of Object.entries(signedFields)) form.set(key, value);
    form.set("file", new File([imageBlob], `source-page-${sourcePage.id}.png`, { type: imageBlob.type || "image/png" }));

    const timestamp = String(Math.floor(Date.now() / 1000));
    const randomString = randomAlphaNumeric(16);
    const signatureFields = {
      "app-id": appId,
      "random-str": randomString,
      timestamp,
      ...signedFields,
    };
    const signatureBase = Object.keys(signatureFields)
      .sort()
      .map((key) => `${key}=${signatureFields[key as keyof typeof signatureFields]}`)
      .join("&");
    const signature = md5(`${signatureBase}&secret=${appSecret}`);

    const response = await fetch(MODE_ENDPOINTS[mode], {
      method: "POST",
      headers: {
        "app-id": appId,
        "random-str": randomString,
        timestamp,
        sign: signature,
      },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await response.json() as {
      status?: boolean;
      res?: { content?: string; latex?: string; conf?: number };
      request_id?: string;
      message?: string;
    };
    if (!response.ok || payload.status !== true) {
      throw new Error(`SimpleTeX OCR failed (${response.status}). Use manual review or retry later.`);
    }

    const extractedText = typeof payload.res?.content === "string" ? payload.res.content : null;
    const extractedLatex = typeof payload.res?.latex === "string" ? payload.res.latex : null;
    const confidence = typeof payload.res?.conf === "number" && Number.isFinite(payload.res.conf)
      ? Math.max(0, Math.min(1, payload.res.conf))
      : null;
    const { data: result, error: resultError } = await admin
      .from("ocr_provider_results")
      .insert({
        owner_profile_id: ownerProfileId,
        source_document_id: sourcePage.source_document_id,
        source_page_id: sourcePage.id,
        source_region_id: body.source_region_id || null,
        provider: "simpletex",
        recognition_mode: mode,
        status: "needs_review",
        extracted_text: extractedText,
        extracted_latex: extractedLatex,
        confidence,
        provider_request_id: payload.request_id ?? null,
        provider_payload_json: {
          request_id: payload.request_id ?? null,
          has_text: Boolean(extractedText),
          has_latex: Boolean(extractedLatex),
        },
      })
      .select("id,status,confidence,extracted_text,extracted_latex,provider_request_id")
      .single();
    if (resultError) throw resultError;

    await auditOwnerAction(ownerProfileId, user.id, "simpletex_ocr.completed", "ocr_provider_results", result.id, {
      source_page_id: sourcePage.id,
      source_region_id: body.source_region_id || null,
      recognition_mode: mode,
      confidence,
      provider_request_id: payload.request_id ?? null,
    });

    return json(request, { ok: true, result });
  } catch (error) {
    return errorResponse(request, error, "SimpleTeX OCR failed");
  }
});

function randomAlphaNumeric(length: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
