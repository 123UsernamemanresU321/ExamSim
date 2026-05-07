import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { parseAiJsonObject } from "../_shared/ai-json.ts";
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
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "You are Exam Vault's expert assessment parser.",
              "",
              "Your job is to convert assessment content into one valid JSON normalized package.",
              "",
              "Return exactly one JSON object.",
              "Do not use markdown fences.",
              "Do not add prose.",
              "Do not include comments.",
              "Do not use trailing commas.",
              "The output must be parseable by JSON.parse().",
              "",
              "You must not solve the questions.",
              "You must not shorten, summarize, or truncate the question prompts.",
              "You must not invent metadata, marks, paper codes, IDs, titles, or missing questions.",
              "",
              "==================================================",
              "INPUT FORMAT",
              "==================================================",
              "",
              "The user may provide either:",
              "",
              "1. Raw LaTeX/raw text containing one or more questions.",
              "",
              "OR",
              "",
              "2. A pre-split object of this shape:",
              "",
              "{",
              "  \"detected_title\": string | null,",
              "  \"detected_source_kind\": \"latex\" | \"raw_text\" | \"pdf_text\" | \"ocr_text\" | \"mixed\" | \"unknown\",",
              "  \"question_chunks\": [",
              "    {",
              "      \"number\": number,",
              "      \"detected_title\": string | null,",
              "      \"latex\": string",
              "    }",
              "  ]",
              "}",
              "",
              "If question_chunks is provided:",
              "- Treat each chunk as one separate top-level question.",
              "- Do not merge chunks.",
              "- Do not split a chunk into another top-level question unless it clearly contains multiple numbered problem headers.",
              "- The number of top-level question nodes in your output must match the number of question_chunks unless there is a clear reason not to.",
              "- Preserve the full latex text of each chunk.",
              "",
              "==================================================",
              "TOP-LEVEL OUTPUT STRUCTURE",
              "==================================================",
              "",
              "Return exactly this shape:",
              "",
              "{",
              "  \"normalized_package\": {",
              "    \"schema_version\": \"2026-05-07\",",
              "    \"assessment\": {",
              "      \"title\": string | null,",
              "      \"paper_code\": string | null,",
              "      \"assessment_kind\": \"exam\" | \"test\" | \"quiz\" | \"worksheet\" | \"assignment\" | \"practice\" | \"unknown\",",
              "      \"source_kind\": \"latex\" | \"raw_text\" | \"pdf_text\" | \"ocr_text\" | \"mixed\" | \"unknown\"",
              "    },",
              "    \"delivery\": {",
              "      \"solutions_requested\": true,",
              "      \"response_policy\": {",
              "        \"typed_allowed\": true,",
              "        \"per_question_pdf_upload\": true",
              "      }",
              "    },",
              "    \"questions\": []",
              "  },",
              "  \"confidence\": number,",
              "  \"warnings\": [],",
              "  \"review_required\": true",
              "}",
              "",
              "Do not add extra top-level fields.",
              "Do not remove required top-level fields.",
              "",
              "==================================================",
              "QUESTION NODE STRUCTURE",
              "==================================================",
              "",
              "Every question node must have exactly this shape:",
              "",
              "{",
              "  \"node_key\": string,",
              "  \"node_type\": \"section\" | \"question\" | \"subquestion\" | \"part\",",
              "  \"ordinal\": number,",
              "  \"title\": string | null,",
              "  \"marks\": number | null,",
              "  \"response_mode\": \"none\" | \"typed_text\" | \"upload_pdf\" | \"typed_or_upload\" | \"multiple_choice\",",
              "  \"prompt\": {",
              "    \"html\": string,",
              "    \"latex\": string",
              "  },",
              "  \"children\": []",
              "}",
              "",
              "Required rules:",
              "- children must always exist.",
              "- If there are no children, use [].",
              "- marks must be null if not explicitly given.",
              "- Do not invent marks.",
              "- For Olympiad/proof questions, use response_mode \"typed_or_upload\".",
              "",
              "==================================================",
              "QUESTION BOUNDARY RULES FOR RAW TEXT",
              "==================================================",
              "",
              "If raw text is provided, scan the whole input from left to right and identify every top-level question marker.",
              "",
              "Recognize these as top-level markers:",
              "",
              "- \\\\textbf{Problem 1. ...}",
              "- \\\\textbf{Problem 2. ...}",
              "- \\\\textbf{Question 1. ...}",
              "- Problem 1.",
              "- Problem 2.",
              "- Question 1.",
              "- Question 2.",
              "- Q1.",
              "- Q2.",
              "- \\\\question",
              "",
              "A question begins at its marker and ends immediately before the next top-level marker.",
              "",
              "Do not merge \"Problem 1\" and \"Problem 2\" into one node just because they are in the same paragraph.",
              "",
              "If the source contains Problem 1 and Problem 2, the output must contain Q1 and Q2.",
              "",
              "If the source contains Problem 1, Problem 2, and Problem 3, the output must contain Q1, Q2, and Q3.",
              "",
              "==================================================",
              "ASSESSMENT METADATA RULES",
              "==================================================",
              "",
              "assessment.title:",
              "- Use detected_title if provided.",
              "- Otherwise extract from \\\\title{...}, centered bold title, or obvious heading.",
              "- If no title exists, use null and add warning \"Missing assessment title.\"",
              "",
              "assessment.paper_code:",
              "- Only use a paper code if explicitly present in the source.",
              "- Otherwise use null.",
              "- Do not invent codes like MO-M1.",
              "",
              "assessment.assessment_kind:",
              "- Use \"exam\" for mock papers, Olympiad papers, formal tests, or multi-question papers.",
              "- Use \"practice\" for practice-only material.",
              "- Use \"unknown\" only if unclear.",
              "",
              "assessment.source_kind:",
              "- Use detected_source_kind if provided.",
              "- Otherwise infer from the source.",
              "",
              "==================================================",
              "TITLE RULES",
              "==================================================",
              "",
              "For a header like:",
              "",
              "\\\\textbf{Problem 1. (POTD 2424)}",
              "",
              "Use:",
              "- node_key: \"Q1\"",
              "- title: \"Problem 1. POTD 2424\"",
              "",
              "For:",
              "",
              "\\\\textbf{Question 3.}",
              "",
              "Use:",
              "- node_key: \"Q3\"",
              "- title: \"Question 3\"",
              "",
              "Do not include the assessment title inside a question prompt if it is only the paper title.",
              "",
              "==================================================",
              "PROMPT RULES",
              "==================================================",
              "",
              "prompt.latex:",
              "- Must contain the full original LaTeX/source for that question.",
              "- Must not be summarized.",
              "- Must not be shortened.",
              "- Must not end mid-word unless the source itself ends mid-word.",
              "- Must not contain the next question.",
              "- Must not contain the assessment title unless the title is part of the question itself.",
              "",
              "prompt.html:",
              "- Convert the prompt into simple safe HTML.",
              "- Preserve math inside <span class=\"math\">...</span> for inline math.",
              "- Preserve display math inside <div class=\"math\">...</div>.",
              "- Do not use scripts, styles, iframes, or unsafe HTML.",
              "",
              "Allowed HTML:",
              "<p>, <strong>, <em>, <br>, <ol>, <ul>, <li>, <span class=\"math\">, <div class=\"math\">",
              "",
              "==================================================",
              "LATEX PRESERVATION RULES",
              "==================================================",
              "",
              "Preserve all mathematical notation:",
              "- \\\\alpha",
              "- \\\\beta",
              "- \\\\mathbb{N}",
              "- \\\\lfloor",
              "- \\\\rfloor",
              "- \\\\min",
              "- \\\\triangle",
              "- \\\\omega",
              "- \\\\Gamma",
              "- align environments",
              "",
              "Escape backslashes correctly for JSON strings.",
              "",
              "Do not rewrite mathematics.",
              "Do not simplify expressions.",
              "Do not remove conditions.",
              "Do not remove diagrams references.",
              "",
              "==================================================",
              "MARKS RULES",
              "==================================================",
              "",
              "Extract marks only when explicit:",
              "- [5 marks]",
              "- [5]",
              "- (5 marks)",
              "- /5",
              "- 5 pts",
              "- 5 points",
              "",
              "If marks are missing:",
              "- marks: null",
              "- add warning \"Missing marks for Q1\", \"Missing marks for Q2\", etc.",
              "",
              "Do not sum marks unless the source explicitly gives the total.",
              "",
              "==================================================",
              "TRUNCATION RULES",
              "==================================================",
              "",
              "Never deliberately truncate prompt.html or prompt.latex.",
              "",
              "Before returning, check every prompt:",
              "- It must not end with incomplete fragments such as \"Prove th\", \"Find al\", \"Suppo\".",
              "- It must not be much shorter than the provided source chunk.",
              "- It must not omit the final sentence of the problem.",
              "",
              "If the provided input itself is truncated, preserve the truncated input and add:",
              "\"Source text for Q1 appears truncated.\"",
              "",
              "If your generated output accidentally truncates a prompt, fix it before returning.",
              "",
              "==================================================",
              "WARNINGS",
              "==================================================",
              "",
              "warnings must be an array of strings.",
              "",
              "Add warnings for:",
              "- Missing assessment title.",
              "- Missing marks.",
              "- Ambiguous hierarchy.",
              "- Possible OCR corruption.",
              "- Source text appears truncated.",
              "- Multiple question markers detected but output count may be uncertain.",
              "- Diagrams/images referenced but not included.",
              "",
              "Do not add a warning for normal LaTeX formatting.",
              "",
              "==================================================",
              "FINAL VALIDATION",
              "==================================================",
              "",
              "Before returning, silently verify:",
              "",
              "1. The response is exactly one JSON object.",
              "2. The top-level object has exactly:",
              "   - normalized_package",
              "   - confidence",
              "   - warnings",
              "   - review_required",
              "3. review_required is true.",
              "4. normalized_package.schema_version is \"2026-05-07\".",
              "5. Every question has:",
              "   - node_key",
              "   - node_type",
              "   - ordinal",
              "   - title",
              "   - marks",
              "   - response_mode",
              "   - prompt",
              "   - children",
              "6. Every children field is an array.",
              "7. Missing marks are null.",
              "8. No metadata was invented.",
              "9. The number of top-level questions matches the detected question chunks.",
              "10. No prompt is truncated.",
              "11. JSON.parse() can parse the result.",
              "",
              "Return the JSON object only.",
            ].join("\n"),
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
    const parsedContent = parseAiJsonObject(content);

    let expectedQuestionCount: number | undefined = undefined;
    if (body.source_kind === "json") {
      try {
        const sourceJson = JSON.parse(sourceText);
        if (Array.isArray(sourceJson.question_chunks)) {
          expectedQuestionCount = sourceJson.question_chunks.length;
        }
      } catch { /* ignore */ }
    }

    const validationErrors = validateNormalizedPackage(parsedContent.value, expectedQuestionCount);
    if (validationErrors.length > 0) {
      throw new Error(`AI response failed backend validation:\n- ${validationErrors.join("\n- ")}`);
    }

    const suggestion = normalizeSuggestion(parsedContent.value, {
      assessmentId: version.assessment_id,
      title: version.assessments?.title ?? "Untitled assessment",
      paperCode: version.assessments?.paper_code ?? undefined,
      assessmentKind: version.assessments?.assessment_kind ?? "test",
      sourceKind: version.source_kind,
      existingPackage,
    }, parsedContent.warnings);

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
}, parserWarnings: string[] = []) {
  let normalizedPackage = raw.normalized_package;
  if (!normalizedPackage) throw new Error("AI response missing normalized_package");
  const warnings = [
    ...parserWarnings,
    ...(Array.isArray(raw.warnings) ? raw.warnings.map(String).filter(Boolean) : []),
  ];
  if (typeof normalizedPackage === "string") {
    const parsedPackage = parseAiJsonObject(normalizedPackage);
    normalizedPackage = parsedPackage.value;
    warnings.push("AI response returned normalized_package as a JSON string; Exam Vault parsed it before validation.");
    warnings.push(...parsedPackage.warnings);
  }
  if (!normalizedPackage || typeof normalizedPackage !== "object") throw new Error("AI response missing normalized_package");
  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.5;
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
    const html = stringValue(prompt.html) ?? stringValue(raw.prompt_html) ?? undefined;
    const latex = stringValue(prompt.latex) ?? stringValue(raw.prompt_latex) ?? undefined;
    const children = Array.isArray(raw.children) ? normalizeQuestions(raw.children, warnings, `${nodeKey}.`) : [];

    return {
      node_id: stringValue(raw.node_id) ?? nodeKey,
      node_key: nodeKey,
      ordinal: Math.max(0, numberValue(raw.ordinal) ?? index + 1),
      node_type: nodeType,
      title: stringValue(raw.title) ?? undefined,
      marks: numberValue(raw.marks) !== null ? Math.max(0, numberValue(raw.marks)!) : undefined,
      response_mode: responseMode,
      prompt: (html || latex) ? { html, latex } : undefined,
      interaction: normalizeInteraction(raw.interaction),
      children: children.length ? children : undefined,
    };
  });
}

function normalizeInteraction(raw: unknown) {
  if (!isRecord(raw)) return undefined;
  const kindStr = String(raw.kind ?? raw.type ?? "").toLowerCase().replaceAll("-", "_");
  let kind: "choice" | "short_text" | "extended_text" = "extended_text";
  if (kindStr.includes("choice")) kind = "choice";
  else if (kindStr.includes("short")) kind = "short_text";

  const choices = Array.isArray(raw.choices)
    ? raw.choices
        .map((c, i) => {
          const rc = isRecord(c) ? c : {};
          const cid = stringValue(rc.choice_id) ?? stringValue(rc.id) ?? String(i + 1);
          const content = stringValue(rc.content_html) ?? stringValue(rc.text) ?? stringValue(rc.content) ?? `Choice ${i + 1}`;
          return { choice_id: cid, content_html: content };
        })
        .filter((c) => c.choice_id && c.content_html)
    : undefined;

  return {
    kind,
    max_choices: numberValue(raw.max_choices) !== null ? Math.max(1, numberValue(raw.max_choices)!) : undefined,
    shuffle: booleanValue(raw.shuffle) ?? undefined,
    choices: choices?.length ? choices : undefined,
  };
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

function validateNormalizedPackage(result: unknown, expectedQuestionCount?: number) {
  const errors: string[] = [];

  if (!isRecord(result)) {
    errors.push("Output is not an object.");
    return errors;
  }

  if (!isRecord(result.normalized_package)) {
    errors.push("Missing top-level normalized_package.");
  }

  if (result.review_required !== true) {
    errors.push("review_required must be true.");
  }

  if (!Array.isArray(result.warnings)) {
    errors.push("warnings must be an array.");
  }

  if (typeof result.confidence !== "number") {
    errors.push("confidence must be a number.");
  }

  const pkg = isRecord(result.normalized_package) ? result.normalized_package : null;
  if (!pkg) return errors;

  if (!Array.isArray(pkg.questions)) {
    errors.push("normalized_package.questions must be an array.");
    return errors;
  }

  if (typeof expectedQuestionCount === "number" && pkg.questions.length !== expectedQuestionCount) {
    errors.push(
      `Expected ${expectedQuestionCount} top-level questions, got ${pkg.questions.length}.`
    );
  }

  for (const qNode of pkg.questions) {
    if (!isRecord(qNode)) {
      errors.push("Question node is not an object.");
      continue;
    }
    const q = qNode as Record<string, any>;
    if (!q.node_key) errors.push("Question missing node_key.");
    if (!q.node_type) errors.push(`${q.node_key || "Question"} missing node_type.`);
    if (q.marks === undefined) errors.push(`${q.node_key} missing marks.`);
    if (!q.response_mode) errors.push(`${q.node_key} missing response_mode.`);
    if (!q.prompt) errors.push(`${q.node_key} missing prompt.`);
    if (!Array.isArray(q.children)) errors.push(`${q.node_key} missing children array.`);

    const prompt = isRecord(q.prompt) ? q.prompt : {};
    const latex = stringValue(prompt.latex) || "";
    const html = stringValue(prompt.html) || "";

    const truncationPattern = /\b(Prove th|Find al|Suppo|Let th|Show th)$/i;
    if (truncationPattern.test(latex.trim())) {
      errors.push(`${q.node_key} latex appears truncated.`);
    }

    if (truncationPattern.test(html.trim())) {
      errors.push(`${q.node_key} html appears truncated.`);
    }

    if (latex.length < 40) {
      errors.push(`${q.node_key} latex prompt suspiciously short.`);
    }
  }

  return errors;
}
