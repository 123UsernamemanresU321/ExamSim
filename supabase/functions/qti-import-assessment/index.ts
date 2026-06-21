import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  title: string;
  assessment_kind: "practice_paper" | "quiz" | "test" | "exam";
  qti_zip_base64: string;
  paper_code?: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    const body = await readJson<Body>(request);
    if (!body.title || !body.assessment_kind || !body.qti_zip_base64) return json({ error: "Missing QTI import fields" }, 400);

    const zipBytes = Uint8Array.from(atob(body.qti_zip_base64), (char) => char.charCodeAt(0));
    const zip = await JSZip.loadAsync(zipBytes);
    const manifestFile = zip.file(/imsmanifest\.xml$/i)[0] ?? null;
    if (!manifestFile) return json({ error: "QTI ZIP is missing imsmanifest.xml" }, 400);
    const manifestXml = await manifestFile.async("string");
    const itemRefs = [...manifestXml.matchAll(/<resource\b[^>]*identifier="([^"]+)"[^>]*(?:href="([^"]+)")?[^>]*>/gi)].map(
      (match, index) => ({ identifier: match[1] || `item-${index + 1}`, href: match[2] || null }),
    );
    const questions = await Promise.all(
      itemRefs.map(async (item, index) => {
        const itemXml = item.href ? await zip.file(item.href)?.async("string") : null;
        const title = itemXml?.match(/title="([^"]+)"/i)?.[1] ?? item.identifier;
        const isChoice = /choiceInteraction/i.test(itemXml ?? "");
        const isNumerical = /baseType="(?:float|integer)"/i.test(itemXml ?? "") || /(?:textEntryInteraction|extendedTextInteraction)[\s\S]{0,200}(?:numeric|number|decimal)/i.test(itemXml ?? "");
        const choices = isChoice ? extractChoices(itemXml ?? "") : [];
        const responseMode = isChoice ? "multiple_choice" : isNumerical ? "numerical" : "typed_text";
        return {
          node_id: item.identifier,
          node_key: item.identifier,
          ordinal: index + 1,
          node_type: "question",
          title,
          response_mode: responseMode,
          marks: null,
          interaction: isChoice
            ? { kind: "choice", max_choices: /maxChoices="([2-9]\d*)"/i.test(itemXml ?? "") ? Number((itemXml ?? "").match(/maxChoices="([2-9]\d*)"/i)?.[1]) : 1, choices }
            : isNumerical
              ? { kind: "numerical" }
              : undefined,
          prompt: { html: `<p>${escapeHtml(title)}</p>` },
        };
      }),
    );

    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .insert({
        owner_profile_id: ownerProfileId,
        title: body.title,
        paper_code: body.paper_code ?? null,
        assessment_kind: body.assessment_kind,
      })
      .select("*")
      .single();
    if (assessmentError) throw assessmentError;

    const sourcePath = `${ownerProfileId}/qti/${assessment.id}/source-${Date.now()}.zip`;
    const { error: sourceUploadError } = await admin.storage.from("assessment-sources").upload(sourcePath, zipBytes, {
      contentType: "application/zip",
      upsert: false,
    });
    if (sourceUploadError) throw sourceUploadError;

    const normalizedPackage = {
      schema_version: "2026-05-06",
      assessment: {
        id: assessment.id,
        title: assessment.title,
        paper_code: assessment.paper_code ?? undefined,
        assessment_kind: assessment.assessment_kind,
        source_kind: "json",
        authoring_origin: "imported",
        display_timezone: "Africa/Johannesburg",
      },
      delivery: {
        delivery_mode: "browser",
        solutions_requested: true,
        response_policy: {
          typed_allowed: true,
          mixed_mode_allowed: true,
          per_question_pdf_upload: false,
          blank_submission_required_for_unattempted: false,
        },
      },
      source: {
        original_object_path: sourcePath,
        normalized_by: "qti-import",
        parse_confidence: 0.78,
        requires_owner_review: true,
      },
      questions,
    };

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .insert({
        assessment_id: assessment.id,
        version_no: 1,
        status: "review_required",
        source_kind: "json",
        source_object_path: sourcePath,
        normalized_package_json: normalizedPackage,
        parse_confidence: 0.78,
        requires_owner_review: true,
      })
      .select("*")
      .single();
    if (versionError) throw versionError;

    const nodeRows = questions.map((node) => ({
      assessment_version_id: version.id,
      node_key: node.node_key,
      ordinal: node.ordinal,
      node_type: node.node_type,
      title: node.title,
      response_mode: node.response_mode,
      prompt_html: node.prompt.html,
      interaction_json: node.interaction ?? null,
    }));
    const { error: nodeError } = await admin.from("question_nodes").insert(nodeRows);
    if (nodeError) throw nodeError;

    await auditOwnerAction(ownerProfileId, user.id, "qti.imported", "assessment_versions", version.id, {
      assessment_id: assessment.id,
      question_count: questions.length,
    });
    return json({ ok: true, assessment_id: assessment.id, draft_version_id: version.id, question_count: questions.length });
  } catch (error) {
    return errorResponse(error, "qti-import-assessment failed");
  }
});

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function extractChoices(itemXml: string) {
  return [...itemXml.matchAll(/<simpleChoice\b[^>]*identifier="([^"]+)"[^>]*>([\s\S]*?)<\/simpleChoice>/gi)]
    .map((match) => ({
      choice_id: match[1],
      content_html: `<p>${escapeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || match[1])}</p>`,
    }))
    .filter((choice) => choice.choice_id && choice.content_html);
}
