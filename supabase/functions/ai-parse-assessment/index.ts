import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
import { loadNormalizedPackage } from "../_shared/package-storage.ts";

type Body = {
  assessment_version_id: string;
  source_kind: "pdf" | "latex" | "json" | "mineru";
  source_text?: string;
  artifact_object_path?: string;
  owner_notes?: string;
  repair?: boolean;
};

type StorageAdmin = {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: Error | null }>;
    };
  };
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.assessment_version_id) return json({ error: "assessment_version_id is required" }, 400);

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) return json({ error: "DEEPSEEK_API_KEY is not configured" }, 500);
    const provider = Deno.env.get("AI_PARSE_PROVIDER") || "deepseek";
    if (provider !== "deepseek") return json({ error: "Only DeepSeek is configured for production AI parse" }, 500);
    const model = body.repair
      ? Deno.env.get("AI_PARSE_REPAIR_MODEL") || "deepseek-v4-pro"
      : Deno.env.get("AI_PARSE_MODEL") || "deepseek-v4-flash";

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("*, assessments(title, paper_code, assessment_kind, owner_profile_id)")
      .eq("id", body.assessment_version_id)
      .single();
    if (versionError) throw versionError;
    if (version.assessments?.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    const sourceText = await loadSourceText(admin, body);
    const existingPackage = await loadNormalizedPackage(admin, version);
    if (!sourceText.trim()) return json({ error: "source_text or artifact_object_path is required" }, 400);

    const { data: parseJob, error: parseJobError } = await admin
      .from("parse_jobs")
      .insert({
        assessment_version_id: body.assessment_version_id,
        owner_profile_id: ownerProfile.id,
        source_object_path: body.artifact_object_path ?? version.source_object_path ?? "owner-pasted-source",
        parser: "deepseek_ai",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (parseJobError) throw parseJobError;

    const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: [
              "You are Exam Vault's assessment parse reviewer.",
              "Return JSON only with exactly: normalized_package, confidence, warnings, review_required.",
              "review_required must be true and confidence must be 0..1.",
              "normalized_package must include schema_version, assessment, delivery, source, and questions.",
              "Every question node must include node_id, node_key, ordinal, node_type, response_mode, and may include prompt.html/prompt.latex, marks, interaction, children.",
              "Allowed node_type values: section, question, subquestion, part.",
              "Allowed response_mode values: none, typed_text, upload_pdf, typed_or_upload, multiple_choice.",
              "For Olympiad and IB papers, preserve section labels, question numbers, subquestion labels like (a), (b), roman parts, and stated marks.",
              "Do not invent missing marks or hidden subquestions; add warnings instead.",
              "Do not publish, finalize, mark, or accuse.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              `Title: ${version.assessments?.title ?? "Untitled assessment"}`,
              `Paper code: ${version.assessments?.paper_code ?? ""}`,
              `Source kind: ${body.source_kind}`,
              `Existing package JSON: ${JSON.stringify(existingPackage ?? {})}`,
              `Owner notes: ${body.owner_notes ?? ""}`,
              `Source text: ${sourceText.slice(0, 80_000)}`,
            ].join("\n\n"),
          },
        ],
      }),
    });
    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      throw new Error(`DeepSeek parse failed: ${deepseekResponse.status} ${errorText.slice(0, 500)}`);
    }
    const completion = await deepseekResponse.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("DeepSeek did not return message content");
    const suggestion = normalizeSuggestion(JSON.parse(content), {
      assessmentId: version.assessment_id,
      title: version.assessments?.title ?? "Untitled assessment",
      paperCode: version.assessments?.paper_code ?? undefined,
      assessmentKind: version.assessments?.assessment_kind ?? "test",
      sourceKind: version.source_kind,
      existingPackage,
    });

    const { data: saved, error: suggestionError } = await admin
      .from("ai_parse_suggestions")
      .insert({
        assessment_version_id: body.assessment_version_id,
        parse_job_id: parseJob.id,
        owner_profile_id: ownerProfile.id,
        provider,
        model,
        source_kind: body.source_kind,
        normalized_package_json: suggestion.normalized_package,
        confidence: suggestion.confidence,
        warnings_json: suggestion.warnings,
        review_required: true,
        status: "proposed",
      })
      .select("*")
      .single();
    if (suggestionError) throw suggestionError;

    await admin
      .from("parse_jobs")
      .update({
        status: "review_required",
        completed_at: new Date().toISOString(),
        result_object_path: null,
      })
      .eq("id", parseJob.id);

    await auditOwnerAction(ownerProfile.id, user.id, "ai_parse.proposed", "assessment_versions", body.assessment_version_id, {
      provider,
      model,
      source_kind: body.source_kind,
      confidence: suggestion.confidence,
    });

    return json({ ok: true, suggestion: saved });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "ai-parse-assessment failed" }, 401);
  }
});

async function loadSourceText(admin: StorageAdmin, body: Body) {
  if (body.source_text?.trim()) return body.source_text;
  if (!body.artifact_object_path) return "";
  const { data, error } = await admin.storage.from("assessment-packages").createSignedUrl(body.artifact_object_path, 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not sign parse artifact");
  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error("Could not read parse artifact");
  return await response.text();
}

function normalizeSuggestion(raw: Record<string, unknown>, context: {
  assessmentId: string;
  title: string;
  paperCode?: string;
  assessmentKind: string;
  sourceKind: string;
  existingPackage: unknown;
}) {
  const normalizedPackage = raw.normalized_package;
  if (!normalizedPackage || typeof normalizedPackage !== "object") throw new Error("AI response missing normalized_package");
  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.5;
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String).filter(Boolean) : [];
  const packageWarnings: string[] = [];
  const repairedPackage = normalizePackageCandidate(normalizedPackage as Record<string, unknown>, context, packageWarnings);
  warnings.push(...packageWarnings);
  if (!warnings.some((warning) => /owner review/i.test(warning))) warnings.push("Owner review is mandatory before publish.");
  return {
    normalized_package: repairedPackage,
    confidence: Math.max(0, Math.min(1, confidence)),
    warnings,
  };
}

function normalizePackageCandidate(pkg: Record<string, unknown>, context: {
  assessmentId: string;
  title: string;
  paperCode?: string;
  assessmentKind: string;
  sourceKind: string;
  existingPackage: unknown;
}, warnings: string[]) {
  const existing = isRecord(context.existingPackage) ? context.existingPackage : {};
  const existingDelivery = isRecord(existing.delivery) ? existing.delivery : {};
  const existingResponsePolicy = isRecord(existingDelivery.response_policy) ? existingDelivery.response_policy : {};
  const existingSource = isRecord(existing.source) ? existing.source : {};
  const questions = Array.isArray(pkg.questions) ? pkg.questions : [];
  if (!Array.isArray(pkg.questions)) warnings.push("AI response did not include a valid questions array; owner must review the generated placeholder.");

  return {
    schema_version: stringValue(pkg.schema_version) ?? "2026-05-07",
    assessment: {
      id: context.assessmentId,
      title: context.title,
      paper_code: context.paperCode,
      assessment_kind: normalizeAssessmentKind(context.assessmentKind),
      source_kind: normalizeSourceKind(context.sourceKind),
      authoring_origin: "owner_uploaded",
      display_timezone: "Africa/Johannesburg",
    },
    delivery: {
      delivery_mode: normalizeDeliveryMode(existingDelivery.delivery_mode),
      start_at_utc: stringValue(existingDelivery.start_at_utc) ?? undefined,
      duration_seconds: numberValue(existingDelivery.duration_seconds) ?? undefined,
      solutions_requested: booleanValue(existingDelivery.solutions_requested) ?? true,
      upload_only_grace_seconds: numberValue(existingDelivery.upload_only_grace_seconds) ?? undefined,
      response_policy: {
        typed_allowed: booleanValue(existingResponsePolicy.typed_allowed) ?? true,
        mixed_mode_allowed: booleanValue(existingResponsePolicy.mixed_mode_allowed) ?? true,
        per_question_pdf_upload: booleanValue(existingResponsePolicy.per_question_pdf_upload) ?? true,
        blank_submission_required_for_unattempted: booleanValue(existingResponsePolicy.blank_submission_required_for_unattempted) ?? false,
      },
    },
    source: {
      original_object_path: stringValue(existingSource.original_object_path) ?? undefined,
      normalized_by: "deepseek_ai_review",
      parse_confidence: numberValue(pkg.source && isRecord(pkg.source) ? pkg.source.parse_confidence : undefined) ?? undefined,
      requires_owner_review: true,
    },
    questions: normalizeQuestions(questions, warnings),
  };
}

function normalizeQuestions(nodes: unknown[], warnings: string[], parentKey = ""): Record<string, unknown>[] {
  return nodes.map((node, index) => {
    const raw = isRecord(node) ? node : {};
    if (!isRecord(node)) warnings.push(`Question node ${parentKey}${index + 1} was not an object and was repaired.`);
    const nodeKey = stringValue(raw.node_key) ?? stringValue(raw.node_id) ?? `${parentKey}${index + 1}`;
    const prompt = isRecord(raw.prompt) ? raw.prompt : {};
    const nodeType = normalizeNodeType(raw.node_type);
    const responseMode = normalizeResponseMode(raw.response_mode);
    if (nodeType === "question" && !stringValue(raw.node_type)) warnings.push(`Question ${nodeKey} was missing node_type and was treated as a question.`);
    if (responseMode === "typed_or_upload" && !stringValue(raw.response_mode)) warnings.push(`Question ${nodeKey} was missing response_mode and was treated as typed_or_upload.`);
    return {
      node_id: stringValue(raw.node_id) ?? nodeKey,
      node_key: nodeKey,
      ordinal: numberValue(raw.ordinal) ?? index + 1,
      node_type: nodeType,
      title: stringValue(raw.title) ?? undefined,
      marks: numberValue(raw.marks) ?? undefined,
      response_mode: responseMode,
      prompt: {
        html: stringValue(prompt.html) ?? stringValue(raw.prompt_html) ?? undefined,
        latex: stringValue(prompt.latex) ?? stringValue(raw.prompt_latex) ?? undefined,
      },
      interaction: isRecord(raw.interaction) ? raw.interaction : undefined,
      children: Array.isArray(raw.children) ? normalizeQuestions(raw.children, warnings, `${nodeKey}.`) : undefined,
    };
  });
}

function normalizeAssessmentKind(value: unknown) {
  return ["practice_paper", "quiz", "test", "exam"].includes(String(value)) ? String(value) : "test";
}

function normalizeSourceKind(value: unknown) {
  return ["pdf", "latex", "json"].includes(String(value)) ? String(value) : "json";
}

function normalizeDeliveryMode(value: unknown) {
  return String(value) === "seb_required" ? "seb_required" : "browser";
}

function normalizeNodeType(value: unknown) {
  return ["section", "question", "subquestion", "part"].includes(String(value)) ? String(value) : "question";
}

function normalizeResponseMode(value: unknown) {
  return ["none", "typed_text", "upload_pdf", "typed_or_upload", "multiple_choice"].includes(String(value))
    ? String(value)
    : "typed_or_upload";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
