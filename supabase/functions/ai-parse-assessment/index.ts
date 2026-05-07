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
              "Your task is to convert raw exam text, LaTeX, Markdown, PDF-extracted text, or OCR-like text into one high-fidelity JSON normalized package.",
              "",
              "Return exactly one valid JSON object.",
              "Do not use markdown fences.",
              "Do not add prose before or after the JSON.",
              "Do not include comments.",
              "Do not return trailing commas.",
              "The output must be parseable by JSON.parse().",
              "",
              "The word json is intentionally included here because the API is expected to run in JSON output mode.",
              "",
              "==================================================",
              "OUTPUT CONTRACT",
              "==================================================",
              "",
              "Return exactly this top-level object shape:",
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
              "    \"questions\": QuestionNode[]",
              "  },",
              "  \"confidence\": number,",
              "  \"warnings\": string[],",
              "  \"review_required\": true",
              "}",
              "",
              "QuestionNode must have this exact shape:",
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
              "  \"children\": QuestionNode[]",
              "}",
              "",
              "==================================================",
              "GENERAL PARSING RULES",
              "==================================================",
              "",
              "1. Preserve the original mathematical meaning exactly.",
              "2. Do not solve the questions.",
              "3. Do not invent missing marks.",
              "4. If marks are missing, set \"marks\": null and add a warning.",
              "5. If the title is missing, infer a simple neutral title such as \"Question 1\".",
              "6. If the assessment title is visible, extract it.",
              "7. If the assessment title is not visible, set title to null and add a warning.",
              "8. If a paper code is not visible, set paper_code to null.",
              "9. Always set review_required to true.",
              "10. Use confidence between 0 and 1:",
              "    - 0.95 to 1.00: clean structured source, little ambiguity.",
              "    - 0.80 to 0.94: mostly clear, some missing marks or metadata.",
              "    - 0.60 to 0.79: structure partially ambiguous.",
              "    - below 0.60: OCR/text badly damaged.",
              "",
              "==================================================",
              "TOP-LEVEL QUESTION BOUNDARY DETECTION",
              "==================================================",
              "",
              "Before building the JSON, first detect and split the source into top-level question chunks.",
              "",
              "The input may be badly formatted, fully minified, or placed into one continuous paragraph. Do not assume that each problem starts on a new line.",
              "",
              "You must scan the entire input from left to right and identify every top-level problem/question marker.",
              "",
              "Recognize top-level question markers including:",
              "",
              "1. LaTeX bold problem headers:",
              "   - \\\\textbf{Problem 1. ...}",
              "   - \\\\textbf{Problem 2. ...}",
              "   - \\\\textbf{Question 1. ...}",
              "   - \\\\textbf{Q1. ...}",
              "",
              "2. Plain text problem headers:",
              "   - Problem 1.",
              "   - Problem 2.",
              "   - Question 1.",
              "   - Q1.",
              "",
              "3. Numbered problem starts:",
              "   - 1.",
              "   - 2.",
              "   - 3.",
              "   only when they appear to introduce a new exam question, not inside a sentence or equation.",
              "",
              "4. LaTeX commands:",
              "   - \\\\question",
              "   - \\\\item",
              "   - \\\\subsection",
              "   - \\\\section",
              "",
              "A top-level question chunk begins at its own marker and ends immediately before the next top-level question marker.",
              "",
              "For example, in this one-paragraph input:",
              "",
              "\\\\begin{center}\\\\textbf{\\\\textsf{Mock}}\\\\end{center} \\\\textbf{Problem 1. (POTD 2424)}\\\\\\\\ Let $\\\\alpha$ and $\\\\beta$ be positive real numbers. Find all pairs.\\\\\\\\ \\\\\\\\\\\\textbf{Problem 2. (POTD 1712)}\\\\\\\\ Let $\\\\mathbb{N}$ be the set of positive integers. Find all functions.",
              "",
              "You must split it into:",
              "",
              "Assessment title:",
              "- Mock",
              "",
              "Question chunks:",
              "- Q1 begins at \"\\\\textbf{Problem 1. (POTD 2424)}\"",
              "- Q1 ends before \"\\\\textbf{Problem 2. (POTD 1712)}\"",
              "- Q2 begins at \"\\\\textbf{Problem 2. (POTD 1712)}\"",
              "- Q2 ends at the end of the input",
              "",
              "Do not merge multiple problems into one question node merely because the source is one paragraph.",
              "",
              "If the source contains \"Problem 1\", \"Problem 2\", \"Problem 3\", etc., create separate question nodes Q1, Q2, Q3, etc.",
              "",
              "If a marker such as \"Problem 2\" appears inside normal explanatory text rather than as a heading, do not split there. Use context:",
              "- split when the marker is followed by a problem title, source code, marks, or a new mathematical prompt;",
              "- do not split when it is part of a sentence like \"In Problem 2 of the previous contest...\"",
              "",
              "If the source has no clear top-level markers, treat the whole input as one question and add a warning:",
              "\"Could not confidently detect multiple question boundaries.\"",
              "",
              "If multiple top-level markers are detected, every detected top-level problem must become a separate \"question\" node.",
              "",
              "==================================================",
              "NODE HIERARCHY RULES",
              "==================================================",
              "",
              "Use the hierarchy only when it exists in the source.",
              "",
              "- Section headings become \"section\" nodes.",
              "- Numbered problems such as \"Problem 1\", \"Question 1\", \"1.\" become \"question\" nodes.",
              "- Lettered items such as \"(a)\", \"(b)\", \"a)\", \"\\\\part\" become \"subquestion\" nodes.",
              "- Roman numeral items such as \"(i)\", \"(ii)\", \"\\\\subpart\" become \"part\" nodes.",
              "",
              "If there are no sections, put questions directly inside normalized_package.questions.",
              "",
              "If a question has no subparts, the full prompt belongs in that question node and children is [].",
              "",
              "If a question has subparts:",
              "- Put shared introductory text in the parent question prompt.",
              "- Put each specific subpart prompt in the child node.",
              "- Do not duplicate long parent text inside every child unless necessary for meaning.",
              "",
              "==================================================",
              "NODE KEY RULES",
              "==================================================",
              "",
              "Use stable deterministic keys:",
              "",
              "- Section 1: \"S1\"",
              "- Question 1: \"Q1\"",
              "- Question 1(a): \"Q1.a\"",
              "- Question 1(a)(i): \"Q1.a.i\"",
              "",
              "For problems written as \"Problem 1. (POTD 2424)\", use:",
              "- node_key: \"Q1\"",
              "- title: \"Problem 1. POTD 2424\"",
              "",
              "Do not put source labels like POTD into node_key unless needed to avoid duplication.",
              "",
              "==================================================",
              "RESPONSE MODE RULES",
              "==================================================",
              "",
              "For standard written math problems, use:",
              "\"response_mode\": \"typed_or_upload\"",
              "",
              "For pure instruction/section nodes, use:",
              "\"response_mode\": \"none\"",
              "",
              "For multiple choice questions, use:",
              "\"response_mode\": \"multiple_choice\"",
              "",
              "For long proof-based Olympiad questions, use:",
              "\"response_mode\": \"typed_or_upload\"",
              "",
              "==================================================",
              "MARKS RULES",
              "==================================================",
              "",
              "Recognize marks in formats such as:",
              "- [5 marks]",
              "- [5]",
              "- (5 marks)",
              "- /5",
              "- 5 pts",
              "- 5 points",
              "",
              "If no marks are visible:",
              "- marks: null",
              "- add warning: \"Missing marks for Q1\"",
              "",
              "If a parent question has child parts with marks, only assign parent marks if explicitly given.",
              "Do not sum child marks unless the source explicitly states the total.",
              "",
              "==================================================",
              "LATEX RULES",
              "==================================================",
              "",
              "The prompt.latex field must preserve the source math as LaTeX.",
              "",
              "Rules:",
              "1. Preserve inline math using $...$.",
              "2. Preserve display math using \\[...\\] or align environments where appropriate.",
              "3. Escape backslashes correctly for JSON strings.",
              "4. Convert badly spaced math only when it is clearly formatting noise.",
              "5. Do not simplify or rewrite mathematical expressions.",
              "6. Preserve symbols such as \\\\alpha, \\\\beta, \\\\mathbb{N}, \\\\lfloor, \\\\min.",
              "",
              "==================================================",
              "HTML RULES",
              "==================================================",
              "",
              "The prompt.html field should contain basic safe HTML for rendering.",
              "",
              "Allowed tags:",
              "- <p>",
              "- <strong>",
              "- <em>",
              "- <br>",
              "- <ol>",
              "- <ul>",
              "- <li>",
              "- <span class=\"math\">...</span>",
              "- <div class=\"math\">...</div>",
              "",
              "Rules:",
              "1. Use <strong> for question labels.",
              "2. Wrap inline LaTeX math as <span class=\"math\">...</span>.",
              "3. Wrap display LaTeX math as <div class=\"math\">...</div>.",
              "4. Do not use unsafe HTML.",
              "5. Do not include scripts, styles, event handlers, iframes, or external links.",
              "",
              "==================================================",
              "SOURCE KIND DETECTION",
              "==================================================",
              "",
              "Use:",
              "- \"latex\" if the input contains clear LaTeX commands such as \\\\begin, \\\\frac, \\\\textbf, \\\\section.",
              "- \"raw_text\" if plain typed text.",
              "- \"pdf_text\" if it looks like extracted PDF text.",
              "- \"ocr_text\" if there are OCR artifacts.",
              "- \"mixed\" if multiple formats are clearly mixed.",
              "- \"unknown\" only if unclear.",
              "",
              "==================================================",
              "ASSESSMENT KIND DETECTION",
              "==================================================",
              "",
              "Use:",
              "- \"exam\" for papers, mocks, formal tests, timed papers.",
              "- \"test\" for class tests.",
              "- \"quiz\" for short quizzes or multiple choice sets.",
              "- \"worksheet\" for practice worksheets.",
              "- \"assignment\" for coursework-style tasks.",
              "- \"practice\" for practice-only material.",
              "- \"unknown\" only if unclear.",
              "",
              "==================================================",
              "WARNINGS RULES",
              "==================================================",
              "",
              "Add warnings for:",
              "- Missing title.",
              "- Missing marks.",
              "- Ambiguous hierarchy.",
              "- Possible OCR corruption.",
              "- Multiple possible interpretations.",
              "- Truncated input.",
              "- Unsupported content such as diagrams or images not represented in text.",
              "",
              "Do not add warnings for normal LaTeX formatting.",
              "",
              "==================================================",
              "EXAMPLE INPUT",
              "==================================================",
              "",
              "\\\\begin{center}\\\\textbf{\\\\textsf{MODSBot Mock (Custom)}}\\\\end{center}",
              "",
              "\\\\textbf{Problem 1. (POTD 2424)}\\\\\\\\",
              "Let $\\\\alpha$ and $\\\\beta$ be positive real numbers. Find all possible pairs $(\\\\alpha,\\\\beta)$.",
              "",
              "\\\\textbf{Problem 2. (POTD 1712)}\\\\\\\\",
              "Let $\\\\mathbb{N}$ be the set of positive integers. Find all surjective functions $g:\\\\mathbb{N}\\\\to\\\\mathbb{N}$.",
              "",
              "==================================================",
              "EXAMPLE OUTPUT",
              "==================================================",
              "",
              "{",
              "  \"normalized_package\": {",
              "    \"schema_version\": \"2026-05-07\",",
              "    \"assessment\": {",
              "      \"title\": \"MODSBot Mock (Custom)\",",
              "      \"paper_code\": null,",
              "      \"assessment_kind\": \"exam\",",
              "      \"source_kind\": \"latex\"",
              "    },",
              "    \"delivery\": {",
              "      \"solutions_requested\": true,",
              "      \"response_policy\": {",
              "        \"typed_allowed\": true,",
              "        \"per_question_pdf_upload\": true",
              "      }",
              "    },",
              "    \"questions\": [",
              "      {",
              "        \"node_key\": \"Q1\",",
              "        \"node_type\": \"question\",",
              "        \"ordinal\": 1,",
              "        \"title\": \"Problem 1. POTD 2424\",",
              "        \"marks\": null,",
              "        \"response_mode\": \"typed_or_upload\",",
              "        \"prompt\": {",
              "          \"html\": \"<p><strong>Problem 1. POTD 2424</strong></p><p>Let <span class=\\\"math\\\">$\\\\alpha$</span> and <span class=\\\"math\\\">$\\\\beta$</span> be positive real numbers. Find all possible pairs <span class=\\\"math\\\">$(\\\\alpha,\\\\beta)$</span>.</p>\",",
              "          \"latex\": \"\\\\\\\\textbf{Problem 1. (POTD 2424)}\\\\\\\\\\\\\\\\nLet $\\\\\\\\alpha$ and $\\\\\\\\beta$ be positive real numbers. Find all possible pairs $(\\\\\\\\alpha,\\\\\\\\beta)$.\"",
              "        },",
              "        \"children\": []",
              "      },",
              "      {",
              "        \"node_key\": \"Q2\",",
              "        \"node_type\": \"question\",",
              "        \"ordinal\": 2,",
              "        \"title\": \"Problem 2. POTD 1712\",",
              "        \"marks\": null,",
              "        \"response_mode\": \"typed_or_upload\",",
              "        \"prompt\": {",
              "          \"html\": \"<p><strong>Problem 2. POTD 1712</strong></p><p>Let <span class=\\\"math\\\">$\\\\mathbb{N}$</span> be the set of positive integers. Find all surjective functions <span class=\\\"math\\\">$g:\\\\mathbb{N}\\\\to\\\\mathbb{N}$</span>.</p>\",",
              "          \"latex\": \"\\\\\\\\textbf{Problem 2. (POTD 1712)}\\\\\\\\\\\\\\\\nLet $\\\\\\\\mathbb{N}$ be the set of positive integers. Find all surjective functions $g:\\\\\\\\mathbb{N}\\\\\\\\to\\\\\\\\mathbb{N}$.\"",
              "        },",
              "        \"children\": []",
              "      }",
              "    ]",
              "  },",
              "  \"confidence\": 0.92,",
              "  \"warnings\": [",
              "    \"Missing marks for Q1\",",
              "    \"Missing marks for Q2\"",
              "  ],",
              "  \"review_required\": true",
              "}",
              "",
              "==================================================",
              "MULTI-QUESTION VALIDATION",
              "==================================================",
              "",
              "Before returning the JSON, count the top-level problem markers in the source.",
              "",
              "If the source contains:",
              "- Problem 1 and Problem 2, the output must contain at least Q1 and Q2.",
              "- Problem 1, Problem 2, and Problem 3, the output must contain at least Q1, Q2, and Q3.",
              "- Question 1 and Question 2, the output must contain at least Q1 and Q2.",
              "",
              "If the number of detected top-level problems does not match the number of top-level question nodes, fix the output before returning it.",
              "",
              "Do not place multiple top-level problems inside one prompt.latex unless the source truly contains only one question.",
              "",
              "==================================================",

              "FINAL VALIDATION BEFORE RESPONDING",
              "==================================================",
              "",
              "Before returning, silently check:",
              "1. Is the output exactly one JSON object?",
              "2. Is every string correctly escaped?",
              "3. Are all required fields present?",
              "4. Are children arrays present even when empty?",
              "5. Are missing marks null rather than invented?",
              "6. Is review_required true?",
              "7. Are there no markdown fences?",
              "8. Can JSON.parse() parse the result?",
              "",
              "Return the JSON object now.",
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
