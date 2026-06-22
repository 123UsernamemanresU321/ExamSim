import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { parseAiJsonObject } from "../_shared/ai-json.ts";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { loadNormalizedPackage } from "../_shared/package-storage.ts";
import { enforceRateLimit, envInt } from "../_shared/rate-limit.ts";
import { enforceProviderMonthlyQuota, envNumber } from "../_shared/provider-quota.ts";
import { assertVersionMutable } from "../_shared/version-governance.ts";

type Body = {
  assessment_version_id: string;
  source_kind: "pdf" | "latex" | "json" | "mineru" | "raw_text";
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

const MAX_PARSE_OUTPUT_TOKENS = 24_000;
const MAX_EXISTING_PACKAGE_CONTEXT_CHARS = 40_000;
const MAX_ORIGINAL_SOURCE_CONTEXT_CHARS = 40_000;
const MAX_SOURCE_CONTEXT_CHARS = 60_000;
const MAX_MARKSCHEME_CONTEXT_CHARS = 60_000;
const MAX_OWNER_NOTES_CHARS = 4_000;

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  let cleanupAdmin: any = null;
  let parseJobId: string | null = null;
  try {
    const context = await requireInstitutionAal2(request, "assessment_authoring");
    const { user, admin, ownerProfileId } = context;
    cleanupAdmin = admin;
    const body = await readJson<Body>(request);
    if (!body.assessment_version_id) return json(request, { error: "assessment_version_id is required" }, 400);

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) return json(request, { error: "DeepSeek AI parse is not configured. Set DEEPSEEK_API_KEY, or use MinerU/manual parse review instead." }, 503);
    const provider = Deno.env.get("AI_PARSE_PROVIDER") || "deepseek";
    if (provider !== "deepseek") return json(request, { error: "Only DeepSeek is configured for production AI parse. Check AI_PARSE_PROVIDER." }, 503);
    const model = body.repair
      ? Deno.env.get("AI_PARSE_REPAIR_MODEL") || "deepseek-v4-pro"
      : Deno.env.get("AI_PARSE_MODEL") || "deepseek-v4-flash";

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("*, assessments(title, paper_code, subject, assessment_kind, owner_profile_id)")
      .eq("id", body.assessment_version_id)
      .single();
    if (versionError) throw versionError;
    assertInstitutionOwner(version.assessments?.owner_profile_id, ownerProfileId);
    assertVersionMutable(version.status);

    const operationalWarnings: string[] = [];
    try {
      await enforceRateLimit(admin, {
        scope: "ai-parse-assessment:owner",
        key: ownerProfileId,
        limit: envInt("AI_PARSE_OWNER_HOURLY_LIMIT", 20),
        windowSeconds: 3600,
      });
    } catch (rateLimitError) {
      if (!isMissingRateLimitBoundary(rateLimitError)) throw rateLimitError;
      console.warn("AI parse rate-limit boundary is not deployed; allowing request with warning.", rateLimitError);
      operationalWarnings.push("AI parse rate-limit database migration is not deployed; owner should apply migrations before production launch.");
    }

    const sourceText = await loadSourceText(admin, body, version);
    const originalSourceText = version.source_object_path && !version.source_object_path.toLowerCase().endsWith(".pdf")
      ? await fetchSourceFromStorage(admin, version.source_object_path, "assessment-sources")
      : "";

    const existingPackage = await loadNormalizedPackage(admin, version);
    const markschemeContext = await loadMarkschemeContext(admin, version, existingPackage);
    if (!sourceText.trim() && !originalSourceText.trim() && version.source_kind !== "pdf") {
      return json(request, { error: "source_text or readable original source is required for non-PDF sources" }, 400);
    }
    
    if (version.source_kind === "pdf" && !sourceText.trim()) {
      return json(request, { error: "The PDF has not been parsed by MinerU yet. Please run MinerU first, then use AI Suggestion." }, 400);
    }

    const { data: parseJob, error: parseJobError } = await admin
      .from("parse_jobs")
      .insert({
        assessment_version_id: body.assessment_version_id,
        owner_profile_id: ownerProfileId,
        source_object_path: body.artifact_object_path ?? version.source_object_path ?? "owner-pasted-source",
        parser: "deepseek_ai",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (parseJobError) throw parseJobError;
    parseJobId = parseJob.id;

    // Collect any image artifacts extracted from MinerU so DeepSeek can assign them to questions
    const imagePaths: string[] = [];
    try {
      // Get all parse job IDs for this version to check for artifacts
      const { data: jobs } = await admin
        .from("parse_jobs")
        .select("id,metadata_json")
        .eq("assessment_version_id", body.assessment_version_id)
        .eq("external_provider", "mineru_hosted");
      
      const jobIds = (jobs ?? []).filter((job: Record<string, unknown>) => parseJobPurpose(job) !== "markscheme").map((job: { id: string }) => job.id);

      if (jobIds.length > 0) {
        const { data: imageArtifacts } = await admin
          .from("parse_job_artifacts")
          .select("object_path")
          .in("parse_job_id", jobIds)
          .eq("artifact_kind", "layout")
          .or("object_path.ilike.%.png,object_path.ilike.%.jpg,object_path.ilike.%.jpeg,object_path.ilike.%.svg")
          .limit(50);
        
        if (imageArtifacts) {
          for (const a of imageArtifacts) {
            if (a.object_path) imagePaths.push(a.object_path);
          }
        }
      }
    } catch (e) {
      console.warn("Could not fetch image artifacts for AI context:", e);
    }

    const deepseekReservationUsd = envNumber("DEEPSEEK_PARSE_RESERVATION_USD", 1);
    const maxOutputTokens = Math.min(
      envInt("AI_PARSE_MAX_OUTPUT_TOKENS", 24_000),
      MAX_PARSE_OUTPUT_TOKENS,
    );
    const monthlyQuota = await enforceProviderMonthlyQuota(admin, {
      ownerProfileId,
      provider: "deepseek",
      unit: "usd",
      units: deepseekReservationUsd,
      limit: envNumber("DEEPSEEK_OWNER_MONTHLY_USD_LIMIT", 20),
    });

    const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        thinking: { type: "disabled" },
        max_tokens: maxOutputTokens,
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
              "3. A \"Review Context\" object containing existing progress:",
              "",
              "{",
              "  \"existing_nodes\": [],",
              "  \"package\": {},",
              "  \"parse_artifacts\": [",
              "    { \"kind\": \"markdown\", \"preview\": \"...\" }",
              "  ]",
              "}",
              "",
              "If Review Context is provided:",
              "- Primary source of truth is the \"preview\" text inside the \"markdown\" artifact.",
              "- Use \"existing_nodes\" to understand the current draft structure if any.",
              "- Your goal is to produce a complete, improved normalized_package by merging the MinerU artifacts into the schema.",
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
              "    \"document_sections\": [",
              "      { \"type\": \"cover\" | \"instructions\" | \"formula_sheet\" | \"question_page\" | \"markscheme_cover\" | \"markscheme_instructions\" | \"markscheme_question_page\" | \"unknown\", \"page_start\": number | null, \"page_end\": number | null, \"reason\": string }",
              "    ],",
              "    \"assessment\": {",
              "      \"title\": string | null,",
              "      \"paper_code\": string | null,",
              "      \"assessment_kind\": \"exam\" | \"test\" | \"quiz\" | \"worksheet\" | \"assignment\" | \"practice\" | \"unknown\",",
              "      \"source_kind\": \"latex\" | \"raw_text\" | \"pdf_text\" | \"ocr_text\" | \"mixed\" | \"unknown\",",
              "      \"markscheme_html\": string | null",
              "    },",
              "    \"delivery\": {",
              "      \"solutions_requested\": true,",
              "      \"response_policy\": {",
              "        \"typed_allowed\": true,",
              "        \"per_question_pdf_upload\": true",
              "      }",
              "    },",
              "    \"questions\": [],",
              "    \"markscheme_nodes\": [],",
              "    \"unmatched_markscheme_sections\": []",
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
              "DOCUMENT CLASSIFICATION RULES",
              "==================================================",
              "",
              "Before extracting questions, classify pages/sections as cover, instructions, formula_sheet, question_page, markscheme_cover, markscheme_instructions, markscheme_question_page, or unknown.",
              "Never classify a cover page, instruction page, formula sheet, contents page, copyright page, or document front page as Q1.",
              "Do not emit front-cover text, candidate instructions, formula sheets, or general paper instructions as question nodes.",
              "Question extraction starts only when actual question content begins, such as a numbered problem with a real mathematical/task prompt.",
              "If the first visible page is a cover and the first actual question appears on page 2 or later, Q1 must reference the actual question page, not the cover.",
              "For markschemes, classify and ignore markscheme covers and general marking instructions before matching question-specific solutions.",
              "Do not map markscheme front-page instructions to Q1. Put only question-specific marking points in per-node markscheme_html.",
              "If markscheme content cannot be confidently matched to a question node, add a warning and leave the node's markscheme_html empty instead of guessing.",
              "",
              "==================================================",
              "QUESTION NODE STRUCTURE",
              "==================================================",
              "",
              "Every question node must have exactly this shape:",
              "",
              "{",
              "  \"node_key\": string,",
              "  \"normalized_key\": string,",
              "  \"display_label\": string | null,",
              "  \"parent_node_key\": string | null,",
              "  \"root_question_key\": string,",
              "  \"depth\": number,",
              "  \"ordinal_path\": [number, ...],",
              "  \"node_type\": \"section\" | \"question\" | \"subquestion\" | \"part\",",
              "  \"ordinal\": number,",
              "  \"title\": string | null,",
              "  \"marks\": number | null,",
              "  \"response_mode\": \"none\" | \"typed_text\" | \"upload_pdf\" | \"typed_or_upload\" | \"multiple_choice\" | \"numerical\",",
              "  \"prompt\": {",
              "    \"html\": string,",
              "    \"latex\": string",
              "  },",
              "  \"assets\": [string, ...],",
              "  \"source_page_start\": number | null,",
              "  \"source_page_end\": number | null,",
              "  \"source_region_json\": object | null,",
              "  \"has_visual_assets\": boolean,",
              "  \"visual_asset_refs\": [string | object, ...],",
              "  \"suggested_topic_tags\": [string, ...],",
              "  \"markscheme_html\": string | null,",
              "  \"children\": []",
              "}",
              "",
              "==================================================",
              "MARKSCHEME AND MARK ALLOCATION RULES",
              "==================================================",
              "",
              "You may receive separate MARKSCHEME CONTEXT from LaTeX, JSON, or MinerU/OCR PDF output.",
              "",
              "Use markscheme context to:",
              "- assign exact marks to answerable leaf nodes when the paper only gives a parent total,",
              "- create concise per-node markscheme_html guidance for the marking workspace,",
              "- preserve global markscheme notes in assessment.markscheme_html.",
              "",
              "Do not use markscheme text to replace or shorten question prompts.",
              "Do not reveal worked solutions inside prompt.html or prompt.latex.",
              "If a markscheme says (a)(i) is 2 marks and (a)(ii) is 3 marks while the paper only shows (a) [5], set the leaves to 2 and 3 and leave the parent as the printed total only if explicit.",
              "Every markscheme_html value must be safe simple HTML and should identify the mark allocation or marking points for that exact node.",
              "Match markscheme nodes by normalized node_key and ordinal_path. For example, markscheme 3(a)(i) maps only to question 3(a)(i), not Q3 or Q1.",
              "",
              "==================================================",
              "ROOT-QUESTION UPLOAD SLOT RULES",
              "==================================================",
              "",
              "Exam Vault creates exactly one student PDF upload slot per root/main question only.",
              "Do not model upload slots on subquestions, sub-subquestions, or deeper parts.",
              "For written PDF/OCR/LaTeX past-paper workflows, subquestion and part nodes are mark-allocation/feedback nodes, not student-submission nodes.",
              "Therefore, never use response_mode \"upload_pdf\" or \"typed_or_upload\" on subquestion or part nodes.",
              "Use response_mode \"none\" on subquestion/part leaves when their answer is included in the main-question PDF upload; they can still carry marks, markscheme_html, feedback, and ordinal_path.",
              "Only use response_mode \"multiple_choice\" or \"numerical\" on a subquestion/part when the source is truly a digital structured question that the student answers directly on the website.",
              "The main/root question receives the single upload slot server-side even if its response_mode is \"none\" because it has children.",
              "",
              "==================================================",
              "SUBQUESTION AND HIERARCHY RULES",
              "==================================================",
              "",
              "1. LEAF NODES (No children):",
              "   - Must carry marks when markable.",
              "   - For PDF-upload papers, use response_mode \"none\" for subquestion/part leaves so they are markable without creating a separate student submission field.",
              "   - For true digital structured questions only, use \"multiple_choice\" or \"numerical\".",
              "",
              "2. PARENT NODES (Has children):",
              "   - Must have response_mode: \"none\".",
              "   - This ensures students don't see a \"blank\" answer box for a question that only serves as a container for parts (a), (b), etc.",
              "   - Example: If Question 3 has parts (a) and (b) in a written paper, Question 3 should have response_mode: \"none\", and parts (a) and (b) should also use response_mode: \"none\" with their own marks.",
              "   - Preserve the shared question stem, shared diagram/table references, and common setup on the parent prompt. Child prompts should contain only the child-specific instruction.",
              "   - Parent marks are display/reference totals only. Marking is calculated from markable child leaves, so do not make a parent directly answerable when it has children.",
              "   - Use response_mode \"multiple_choice\" with interaction.kind \"choice\" and max_choices > 1 for multi-select questions.",
              "   - Use response_mode \"numerical\" with interaction.kind \"numerical\" when the expected answer is a number, value, numerator, count, measurement, coordinate, or decimal; include unit, min_value, max_value, step, or tolerance only when explicit in the source.",
              "",
              "3. HIERARCHY:",
              "   - Never return a flat list if hierarchy can be inferred.",
              "   - \"subquestion\" nodes must be inside the \"children\" array of a \"question\" node.",
              "   - \"part\" nodes must be inside the \"children\" array of a \"subquestion\" node.",
              "   - For deeper nesting beyond part, keep nesting inside the child node's children array rather than flattening.",
              "   - Never flatten the structure. If the source shows \"3(a)(i)\", the structure must be:",
              "     Q3 (parent) -> (a) (child) -> (i) (grandchild).",
              "   - Do not emit sibling top-level nodes like \"3(a)\" and \"3(a)(i)\" when the notation clearly shows a parent-child relationship.",
              "   - Every node should include depth and ordinal_path metadata that matches its position, e.g. Q3 -> depth 0 / [3], 3(a) -> depth 1 / [3,1], 3(a)(ii) -> depth 2 / [3,1,2].",
              "   - Every node must include parent_node_key and root_question_key. Root questions use parent_node_key null. Descendants use the nearest parent key.",
              "   - If a subquestion is found before its parent text, create the missing parent question with response_mode \"none\" and place the subquestion under it.",
              "",
              "==================================================",
              "DIAGRAM AND ASSET MAPPING RULES",
              "==================================================",
              "",
              "1. EXTRACTED DIAGRAMS:",
              "   - You will be provided with a list of \"Available diagram image paths\" (e.g. [\"parse-jobs/.../image_1.png\"]).",
              "   - Scan the question text for references like \"Diagram 1\", \"Figure 2\", \"the graph below\", or \"as shown in the sketch\".",
              "   - Assign the corresponding image path to the \"assets\" array of the specific node where it is first mentioned or most relevant.",
              "   - If a diagram, table, image, graph, or shared figure is needed for all child questions, attach it to the nearest common parent node.",
              "   - One image can be assigned to multiple nodes if it is needed for all subquestions and no common parent is appropriate.",
              "   - If no images are available or relevant, use an empty array [].",
              "",
              "2. PROMPT REFERENCES:",
              "   - Do not remove text like \"[Diagram 1]\" or \"Figure 1\" from the prompts; these help the student understand which asset they are looking at.",
              "",
              "==================================================",
              "QUESTION BANK AND SOURCE-PAGE FALLBACK RULES",
              "==================================================",
              "",
              "Exam Vault can extract approved root questions into a private question bank. Question-bank pages must still show diagrams, graphs, tables, figures, images, and original layout context from the source PDF.",
              "Question bank extraction uses source_pdf_object_path plus source_page_start/source_page_end to render original PDF source pages. Your job is to provide the page metadata needed for that fallback.",
              "Root question source_page_start/source_page_end must span the full page range of every descendant. Example: if Q2 has no printed body page but 2(a) is page 4 and 2(b) is page 6, Q2 must have source_page_start 4 and source_page_end 6.",
              "Every child/subquestion/part should also include its own source_page_start/source_page_end when known.",
              "Set has_visual_assets true when the question depends on a diagram, graph, figure, image, chart, table, data booklet extract, or visual layout.",
              "Set visual_asset_refs to concise references such as \"page 4 graph\", \"Figure 2\", \"table on page 5\", or an available image artifact path. If precise image assets are unavailable, still include a descriptive visual_asset_refs entry and the source page range.",
              "If exact crop coordinates are known from OCR/layout metadata, put them in source_region_json. If not, use null and rely on source_page_start/source_page_end.",
              "If a visual is shared by several subparts, attach has_visual_assets and visual_asset_refs to the nearest common parent as well as source page ranges on children when known.",
              "Never drop a diagram/table/graph reference just because no extracted image artifact exists; preserve the prompt reference, set has_visual_assets true, include source pages, and add a warning.",
              "Use Suggested subject/course context from the user message for suggested_topic_tags. Do not invent a formal syllabus label, but you may suggest low-risk tags like mechanics, vectors, stoichiometry, inequalities, proof, graph-reading, or calculus when the content clearly supports them.",
              "Suggested topic tags must be optional hints for owner review; they must not replace the question text, marks, source pages, or markscheme mapping.",
              "",
              "==================================================",
              "EXAMPLE STRUCTURE (IB/IGCSE style)",
              "==================================================",
              "",
              "Source:",
              "3. Solve the equation x^2 = 4. [2 marks]",
              "   (a) Find x. [1 mark]",
              "   (b) Verify your answer. [1 mark]",
              "",
              "JSON:",
              "{",
              "  \"node_key\": \"Q3\",",
              "  \"normalized_key\": \"Q3\",",
              "  \"parent_node_key\": null,",
              "  \"root_question_key\": \"Q3\",",
              "  \"depth\": 0,",
              "  \"ordinal_path\": [3],",
              "  \"node_type\": \"question\",",
              "  \"response_mode\": \"none\",",
              "  \"prompt\": { \"latex\": \"Solve the equation $x^2 = 4$.\" },",
              "  \"children\": [",
              "    { \"node_key\": \"3(a)\", \"node_type\": \"subquestion\", \"response_mode\": \"none\", \"marks\": 1, ... },",
              "    { \"node_key\": \"3(b)\", \"node_type\": \"subquestion\", \"response_mode\": \"none\", \"marks\": 1, ... }",
              "  ]",
              "}",
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
              "\\textbf{Question 3.}",
              "",
              "Use:",
              "- node_key: \"Q3\"",
              "- title: \"Question 3\"",
              "",
              "The title field must contain the full problem/question header found in the source.",
              "",
              "==================================================",
              "PROMPT RULES",
              "==================================================",
              "",
              "CRITICAL: The title/header (e.g. \"Problem 1\") MUST NOT be included inside prompt.html or prompt.latex. These fields must contain ONLY the question body.",
              "",
              "prompt.latex:",
              "- Must contain ONLY the body of the question.",
              "- Must not be summarized or shortened.",
              "- Must not include the question header/title (e.g. \"Problem 1.\").",
              "",
              "prompt.html:",
              "- Must contain ONLY the body of the question, converted to simple safe HTML.",
              "- Every paragraph must be wrapped in <p>...</p>.",
              "- DO NOT use <br><br> for paragraph spacing.",
              "- Inline math must be preserved as raw LaTeX ($...$) inside the paragraph.",
              "- CRITICAL: All mathematical variables (e.g. x, y, n), functions (e.g. f(x), g(y-1)), and equations MUST be wrapped in $...$ delimiters to ensure correct academic typesetting. Do not wrap normal English words (like the word 'a'), punctuation, or non-mathematical text.",
              "- CRITICAL: OCR sometimes inserts spaces inside numbers or LaTeX, such as \"1 9 \\\\times 1 8\" or \"x ^ {3} = 2 8\". Repair these only when clearly mathematical, and wrap all mathematical expressions in $...$ or $$...$$ delimiters.",
              "- CRITICAL: Do not wrap individual variables, numbers, or short expressions in their own <p> tags. Keep whole sentences or paragraphs together in a single <p>.",
              "- CRITICAL: Do not split one mathematical expression across separate paragraphs. Keep expressions such as $\\\\lambda \\ge 1$ or $\\\\floor{\\\\lambda^{n+1}}$ together inside one paragraph or display block.",
              "- CRITICAL: When OCR loses subscript markers, convert compact indexed variables to explicit subscripts in LaTeX. Examples: a0 -> $a_0$, aN -> $a_N$, ak -> $a_k$, ak+1 -> $a_{k+1}$, and ak-1 -> $a_{k-1}$ when the surrounding text clearly indicates indexed variables.",
              "- Display math should use <div class=\"math\">$$...$$</div>.",
              "- Use semantic HTML tables for tabular or grid content. Use <table><tbody><tr><td>...</td></tr></tbody></table>, preserve blank cells as empty <td></td>, and put math delimiters inside cells when a cell contains variables, formulas, or numbers.",
              "- Do not flatten tables into tabs or spaces. If the source visually has rows and columns, prompt.html must contain a table.",
              "",
              "Allowed HTML:",
              "<p>, <strong>, <em>, <br>, <ol>, <ul>, <li>, <div class=\"math\">, <table>, <thead>, <tbody>, <tr>, <th>, <td>",
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
              "- For floor/ceiling expressions, write floor notation as \\\\lfloor ... \\\\rfloor or \\\\floor{...}. Never leave \\\\floor as a standalone token without its argument.",
              "- \\\\min",
              "- \\\\triangle",
              "- \\\\omega",
              "- \\\\Gamma",
              "- align environments",
              "",
              "- Escape backslashes correctly for JSON strings. If you want \"\mathbb\", you must write \"\\\\mathbb\" in the JSON stream. Do not double-escape to \"\\\\\\\\mathbb\".",
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
              "Leaf answer nodes should carry the marks for that answerable part.",
              "If a parent question has children, leave parent marks null unless the source explicitly prints a parent total.",
              "Do not invent parent totals. If a parent total is printed, store it on the parent as a reference, but child marks remain the marking source of truth.",
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
              `Suggested subject/course context: ${version.assessments?.subject ?? ""}`,
              `Source kind: ${body.source_kind}`,
              `Existing package JSON: ${JSON.stringify(existingPackage ?? {}).slice(0, MAX_EXISTING_PACKAGE_CONTEXT_CHARS)}`,
              `Owner notes: ${(body.owner_notes ?? "").slice(0, MAX_OWNER_NOTES_CHARS)}`,
              `Original source text (full context): ${originalSourceText.slice(0, MAX_ORIGINAL_SOURCE_CONTEXT_CHARS)}`,
              `Review context (nodes/artifacts): ${sourceText.slice(0, MAX_SOURCE_CONTEXT_CHARS)}`,
              `Markscheme context (solutions, mark allocations, and marking guidance): ${markschemeContext.slice(0, MAX_MARKSCHEME_CONTEXT_CHARS)}`,
              ...(imagePaths.length > 0 ? [`Available diagram image paths (assign to the matching question's "assets" array): ${JSON.stringify(imagePaths)}`] : []),
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
    }, [...operationalWarnings, ...parsedContent.warnings]);

    const { data: saved, error: suggestionError } = await admin
      .from("ai_parse_suggestions")
      .insert({
        assessment_version_id: body.assessment_version_id,
        parse_job_id: parseJob.id,
        owner_profile_id: ownerProfileId,
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
        metadata_json: {
          deepseek_reserved_cost_usd: deepseekReservationUsd,
          deepseek_monthly_usd_remaining: monthlyQuota.remaining,
          prompt_tokens: completion?.usage?.prompt_tokens ?? null,
          completion_tokens: completion?.usage?.completion_tokens ?? null,
          total_tokens: completion?.usage?.total_tokens ?? null,
          max_output_tokens: maxOutputTokens,
          thinking_mode: "disabled",
          input_context_chars: {
            existing_package: Math.min(JSON.stringify(existingPackage ?? {}).length, MAX_EXISTING_PACKAGE_CONTEXT_CHARS),
            original_source: Math.min(originalSourceText.length, MAX_ORIGINAL_SOURCE_CONTEXT_CHARS),
            review_context: Math.min(sourceText.length, MAX_SOURCE_CONTEXT_CHARS),
            markscheme: Math.min(markschemeContext.length, MAX_MARKSCHEME_CONTEXT_CHARS),
          },
          owner_quota_usd: envNumber("DEEPSEEK_OWNER_MONTHLY_USD_LIMIT", 20),
        },
      })
      .eq("id", parseJob.id);

    await auditOwnerAction(ownerProfileId, user.id, "ai_parse.proposed", "assessment_versions", body.assessment_version_id, {
      provider,
      model,
      source_kind: body.source_kind,
      confidence: suggestion.confidence,
      reserved_cost_usd: deepseekReservationUsd,
      monthly_usd_remaining: monthlyQuota.remaining,
      max_output_tokens: maxOutputTokens,
      thinking_mode: "disabled",
    });

    return json(request, { ok: true, suggestion: saved });
  } catch (error) {
    console.error("AI Parse error:", error);
    if (cleanupAdmin && parseJobId) {
      try {
        await cleanupAdmin
          .from("parse_jobs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: safeErrorMessage(error),
          })
          .eq("id", parseJobId)
          .eq("status", "running");
      } catch (cleanupError) {
        console.error("Could not mark AI parse job failed:", cleanupError);
      }
    }
    return errorResponse(request, error, "ai-parse-assessment failed");
  }
});

function isMissingRateLimitBoundary(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /consume_edge_rate_limit|edge_rate_limits|function .* does not exist|function digest|schema cache|could not find.*function|relation .* does not exist|404/i.test(message);
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "ai-parse-assessment failed");
  return message.slice(0, 1000);
}

async function loadSourceText(admin: any, body: Body, version: any) {
  if (body.source_text?.trim()) return body.source_text;
  
  // If an artifact path is provided (e.g. from a specific parse job result), use it
  if (body.artifact_object_path && !body.artifact_object_path.toLowerCase().endsWith(".pdf")) {
    return await fetchSourceFromStorage(admin, body.artifact_object_path, "assessment-packages");
  }

  // If source is PDF, find the best MinerU artifact automatically
  if (version.source_kind === "pdf" || body.source_kind === "mineru") {
    const { data: parseJobs } = await admin
      .from("parse_jobs")
      .select("*")
      .eq("assessment_version_id", version.id)
      .in("parser", ["mineru", "mineru_hosted"])
      .eq("status", "review_required")
      .order("completed_at", { ascending: false });
    
    const latestJob = (parseJobs ?? []).find((job: Record<string, unknown>) => parseJobPurpose(job) !== "markscheme");
    if (latestJob?.result_object_path) {
      console.log(`[AI Parse] Automatically using MinerU artifact: ${latestJob.result_object_path}`);
      return await fetchSourceFromStorage(admin, latestJob.result_object_path, "assessment-packages");
    }
  }

  return "";
}

async function loadMarkschemeContext(admin: any, version: any, existingPackage: unknown) {
  const parts: string[] = [];
  const existing = isRecord(existingPackage) ? existingPackage : {};
  const existingAssessment = isRecord(existing.assessment) ? existing.assessment : {};
  const existingMarkschemeHtml = stringValue(existingAssessment.markscheme_html);
  if (existingMarkschemeHtml) parts.push(`Existing package global markscheme:\n${existingMarkschemeHtml}`);
  if (typeof version.markscheme_html === "string" && version.markscheme_html.trim()) {
    parts.push(`Assessment version markscheme:\n${version.markscheme_html}`);
  }

  if (version.markscheme_source_object_path && version.markscheme_source_kind !== "pdf") {
    try {
      const text = await fetchSourceFromStorage(admin, version.markscheme_source_object_path, "assessment-sources");
      if (text.trim()) parts.push(`Uploaded ${version.markscheme_source_kind} markscheme source:\n${text}`);
    } catch (error) {
      parts.push(`Uploaded markscheme source could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  const { data: parseJobs } = await admin
    .from("parse_jobs")
    .select("*")
    .eq("assessment_version_id", version.id)
    .in("parser", ["mineru", "mineru_hosted"])
    .in("status", ["review_required", "succeeded"])
    .order("completed_at", { ascending: false });

  const markschemeJobs = (parseJobs ?? []).filter((job: Record<string, unknown>) => parseJobPurpose(job) === "markscheme");
  for (const job of markschemeJobs.slice(0, 3)) {
    if (!job.result_object_path || typeof job.result_object_path !== "string") continue;
    try {
      const text = await fetchSourceFromStorage(admin, job.result_object_path, "assessment-packages");
      if (text.trim()) parts.push(`MinerU/OCR markscheme artifact (${job.result_object_path}):\n${text}`);
    } catch (error) {
      parts.push(`MinerU/OCR markscheme artifact could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return parts.join("\n\n---\n\n");
}

function parseJobPurpose(job: Record<string, unknown>) {
  const metadata = isRecord(job.metadata_json) ? job.metadata_json : {};
  return metadata.parse_purpose === "markscheme" ? "markscheme" : "paper";
}

async function fetchSourceFromStorage(admin: StorageAdmin, path: string, bucket: string) {
  if (path.toLowerCase().endsWith(".pdf")) {
    console.warn(`[AI Parse] Attempted to fetch binary PDF as text: ${path}. Skipping.`);
    return "";
  }
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`Could not sign artifact in ${bucket}`);
  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error(`Could not read artifact in ${bucket}`);
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
  const warnings = [
    ...parserWarnings,
    ...(Array.isArray(raw.warnings) ? raw.warnings.map(String).filter(Boolean) : []),
  ];
  if (!normalizedPackage && Array.isArray(raw.questions)) {
    normalizedPackage = raw;
    warnings.push("AI response returned the direct package shape; Exam Vault wrapped and repaired it before storage.");
  }
  if (!normalizedPackage) throw new Error("AI response missing normalized_package");
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
  const existingAssessment = isRecord(existing.assessment) ? existing.assessment : {};
  const pkgAssessment = isRecord(pkg.assessment) ? pkg.assessment : {};
  const existingDelivery = isRecord(existing.delivery) ? existing.delivery : {};
  const existingResponsePolicy = isRecord(existingDelivery.response_policy) ? existingDelivery.response_policy : {};
  const existingSource = isRecord(existing.source) ? existing.source : {};
  const questions = Array.isArray(pkg.questions) ? pkg.questions : [];
  if (!Array.isArray(pkg.questions)) warnings.push("AI response did not include a valid questions array; owner must review the generated placeholder.");
  const normalizedQuestions = normalizeQuestions(questions, warnings);
  const repairedQuestions = repairNormalizedQuestionHierarchy(normalizedQuestions, warnings);

  return {
    schema_version: stringValue(pkg.schema_version) ?? "2026-05-07",
    document_sections: Array.isArray(pkg.document_sections) ? pkg.document_sections.filter(isRecord) : [],
    assessment: {
      id: context.assessmentId,
      title: context.title,
      paper_code: context.paperCode,
      assessment_kind: normalizeAssessmentKind(context.assessmentKind),
      source_kind: normalizeSourceKind(context.sourceKind),
      authoring_origin: "owner_uploaded",
      display_timezone: "Africa/Johannesburg",
      markscheme_html: stringValue(pkgAssessment.markscheme_html) ?? stringValue(existingAssessment.markscheme_html) ?? undefined,
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
    questions: repairedQuestions,
    markscheme_nodes: Array.isArray(pkg.markscheme_nodes) ? pkg.markscheme_nodes.filter(isRecord) : [],
    unmatched_markscheme_sections: Array.isArray(pkg.unmatched_markscheme_sections) ? pkg.unmatched_markscheme_sections.filter(isRecord) : [],
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
    const assets = Array.isArray(raw.assets) ? raw.assets.filter(a => typeof a === "string") : [];
    const visualAssetRefs = Array.isArray(raw.visual_asset_refs)
      ? raw.visual_asset_refs.filter((asset) => typeof asset === "string" || isRecord(asset))
      : [];
    const suggestedTopicTags = Array.isArray(raw.suggested_topic_tags)
      ? raw.suggested_topic_tags.map(String).map((tag) => tag.trim()).filter(Boolean)
      : [];
    const children = Array.isArray(raw.children) ? normalizeQuestions(raw.children, warnings, `${nodeKey}.`) : [];
    const promptText = stripMarkup(`${html ?? ""} ${latex ?? ""}`);
    if (children.length === 0 && promptText.length > 0 && promptText.length < 40) {
      warnings.push(`${nodeKey} prompt is short; owner should verify PDF/OCR extraction.`);
    }

    // Force response_mode: none for parents and written-paper subparts. Root question upload
    // slots are created server-side; subparts carry marks/feedback, not separate PDF uploads.
    let finalResponseMode = children.length > 0 ? "none" : responseMode;
    if (
      children.length === 0 &&
      (nodeType === "subquestion" || nodeType === "part") &&
      (finalResponseMode === "upload_pdf" || finalResponseMode === "typed_or_upload" || finalResponseMode === "typed_text")
    ) {
      finalResponseMode = "none";
      warnings.push(`${nodeKey} was changed to response_mode none because subquestion uploads/submissions are handled by the root question PDF slot.`);
    }

    return {
      node_id: stringValue(raw.node_id) ?? nodeKey,
      node_key: nodeKey,
      display_label: stringValue(raw.display_label) ?? undefined,
      depth: numberValue(raw.depth) !== null ? Math.max(0, Math.trunc(numberValue(raw.depth)!)) : undefined,
      ordinal_path: Array.isArray(raw.ordinal_path)
        ? raw.ordinal_path.map(numberValue).filter((value): value is number => typeof value === "number").map((value) => Math.max(0, Math.trunc(value)))
        : undefined,
      ordinal: Math.max(0, numberValue(raw.ordinal) ?? index + 1),
      node_type: nodeType,
      title: stringValue(raw.title) ?? undefined,
      marks: numberValue(raw.marks) !== null ? Math.max(0, numberValue(raw.marks)!) : undefined,
      response_mode: finalResponseMode,
      prompt: (html || latex) ? { html, latex } : undefined,
      markscheme_html: stringValue(raw.markscheme_html) ?? stringValue(raw.marking_guide_html) ?? undefined,
      assets: assets.length ? assets : undefined,
      source_page_start: numberValue(raw.source_page_start) !== null ? Math.max(1, Math.trunc(numberValue(raw.source_page_start)!)) : undefined,
      source_page_end: numberValue(raw.source_page_end) !== null ? Math.max(1, Math.trunc(numberValue(raw.source_page_end)!)) : undefined,
      source_region_json: isRecord(raw.source_region_json) ? raw.source_region_json : undefined,
      has_visual_assets: booleanValue(raw.has_visual_assets) ?? (assets.length > 0 || visualAssetRefs.length > 0 ? true : undefined),
      visual_asset_refs: visualAssetRefs.length ? visualAssetRefs : undefined,
      suggested_topic_tags: suggestedTopicTags.length ? suggestedTopicTags : undefined,
      interaction: normalizeInteraction(raw.interaction),
      children: children.length ? children : undefined,
    };
  });
}

function repairNormalizedQuestionHierarchy(nodes: Record<string, unknown>[], warnings: string[]) {
  const flat = flattenQuestionCandidates(nodes);
  const byKey = new Map<string, Record<string, unknown>>();
  const firstSeen = new Map<string, number>();

  flat.forEach(({ node, index }) => {
    const parsed = parseHierarchyKey(stringValue(node.node_key) ?? stringValue(node.normalized_key) ?? stringValue(node.node_id) ?? String(index + 1), numberValue(node.ordinal) ?? index + 1);
    if (!parsed) return;
    const normalized = {
      ...node,
      node_id: stringValue(node.node_id) ?? parsed.normalizedKey,
      node_key: parsed.normalizedKey,
      normalized_key: parsed.normalizedKey,
      display_label: parsed.displayLabel,
      parent_node_key: parsed.parentKey,
      root_question_key: parsed.rootKey,
      depth: parsed.depth,
      ordinal_path: parsed.path,
      ordinal: parsed.path[parsed.path.length - 1] ?? index + 1,
      node_type: parsed.depth === 0 ? "question" : parsed.depth === 1 ? "subquestion" : "part",
      marks_available: numberValue(node.marks_available) ?? numberValue(node.marks) ?? undefined,
      children: [],
    };

    const existing = byKey.get(parsed.normalizedKey);
    if (existing) {
      byKey.set(parsed.normalizedKey, mergeAiNodes(existing, normalized));
      warnings.push(`Duplicate AI node ${parsed.normalizedKey} was merged during hierarchy repair.`);
    } else {
      byKey.set(parsed.normalizedKey, normalized);
      firstSeen.set(parsed.normalizedKey, index);
    }
  });

  for (const node of [...byKey.values()]) {
    const path = Array.isArray(node.ordinal_path) ? node.ordinal_path.filter((value): value is number => typeof value === "number") : [];
    for (let length = 1; length < path.length; length += 1) {
      const parentPath = path.slice(0, length);
      const parentKey = normalizedKeyForPath(parentPath);
      if (byKey.has(parentKey)) continue;
      byKey.set(parentKey, {
        node_id: parentKey,
        node_key: parentKey,
        normalized_key: parentKey,
        display_label: displayLabelForPath(parentPath),
        parent_node_key: parentPath.length > 1 ? normalizedKeyForPath(parentPath.slice(0, -1)) : null,
        root_question_key: `Q${parentPath[0]}`,
        depth: parentPath.length - 1,
        ordinal_path: parentPath,
        ordinal: parentPath[parentPath.length - 1] ?? 1,
        node_type: parentPath.length === 1 ? "question" : parentPath.length === 2 ? "subquestion" : "part",
        title: parentPath.length === 1 ? `Question ${parentPath[0]}` : undefined,
        marks: undefined,
        marks_available: undefined,
        mark_mode: "computed",
        response_mode: "none",
        children: [],
      });
      warnings.push(`Created missing AI parent node ${parentKey}.`);
    }
  }

  const sorted = [...byKey.values()].sort((a, b) => {
    const pathCompare = comparePath(recordPath(a), recordPath(b));
    if (pathCompare !== 0) return pathCompare;
    return (firstSeen.get(String(a.node_key)) ?? 0) - (firstSeen.get(String(b.node_key)) ?? 0);
  });
  const nodeMap = new Map<string, Record<string, unknown>>(
    sorted.map((node) => [String(node.node_key), { ...node, children: [] as Record<string, unknown>[] } as Record<string, unknown>]),
  );
  const roots: Record<string, unknown>[] = [];

  for (const node of nodeMap.values()) {
    const path = recordPath(node);
    const parentKey = path.length > 1 ? normalizedKeyForPath(path.slice(0, -1)) : null;
    node.parent_node_key = parentKey;
    node.root_question_key = path.length ? `Q${path[0]}` : String(node.node_key);
    node.depth = Math.max(0, path.length - 1);
    node.node_type = path.length === 1 ? "question" : path.length === 2 ? "subquestion" : "part";
    const parent = parentKey ? nodeMap.get(parentKey) : null;
    if (parent) (parent.children as Record<string, unknown>[]).push(node);
    else roots.push(node);
  }

  sortAiTree(roots);
  roots.forEach(finalizeAiNode);
  return roots;
}

function flattenQuestionCandidates(nodes: Record<string, unknown>[]) {
  const flat: Array<{ node: Record<string, unknown>; index: number }> = [];
  let index = 0;
  const visit = (node: Record<string, unknown>) => {
    flat.push({ node, index });
    index += 1;
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (isRecord(child)) visit(child);
      }
    }
  };
  nodes.forEach(visit);
  return flat;
}

function finalizeAiNode(node: Record<string, unknown>) {
  const children = Array.isArray(node.children) ? node.children.filter(isRecord) : [];
  children.forEach(finalizeAiNode);
  const depth = numberValue(node.depth) ?? 0;
  if (children.length) {
    const childStarts = children.map((child) => numberValue(child.source_page_start)).filter((value): value is number => typeof value === "number" && value > 0);
    const childEnds = children.map((child) => numberValue(child.source_page_end) ?? numberValue(child.source_page_start)).filter((value): value is number => typeof value === "number" && value > 0);
    if (numberValue(node.source_page_start) === null && childStarts.length) node.source_page_start = Math.min(...childStarts);
    if (numberValue(node.source_page_end) === null && childEnds.length) node.source_page_end = Math.max(...childEnds);
    const childAssets = children.flatMap((child) => Array.isArray(child.assets) ? child.assets.filter((asset): asset is string => typeof asset === "string") : []);
    const childVisualRefs = children.flatMap((child) => Array.isArray(child.visual_asset_refs) ? child.visual_asset_refs.filter((asset) => typeof asset === "string" || isRecord(asset)) : []);
    node.assets = mergeStringArrays(node.assets, childAssets);
    node.visual_asset_refs = mergeVisualRefs(node.visual_asset_refs, childVisualRefs);
    node.has_visual_assets = Boolean(node.has_visual_assets || childAssets.length || childVisualRefs.length || children.some((child) => child.has_visual_assets));
    node.mark_mode = "computed";
    node.response_mode = depth === 0 ? "upload_pdf" : "none";
    if (numberValue(node.marks_available) === null) {
      const childTotal = children.reduce((sum, child) => sum + (numberValue(child.marks_available) ?? numberValue(child.marks) ?? 0), 0);
      if (childTotal > 0) {
        node.marks_available = childTotal;
        if (numberValue(node.marks) === null) node.marks = childTotal;
      }
    }
    return;
  }

  node.mark_mode = "manual";
  if (depth > 0) {
    node.response_mode = "none";
  } else if (!node.response_mode || node.response_mode === "typed_or_upload") {
    node.response_mode = "upload_pdf";
  }
  node.marks_available = numberValue(node.marks_available) ?? numberValue(node.marks) ?? undefined;
}

function mergeAiNodes(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const existingPrompt = promptRichness(existing);
  const incomingPrompt = promptRichness(incoming);
  const promptSource = incomingPrompt > existingPrompt ? incoming : existing;
  return {
    ...existing,
    title: existing.title ?? incoming.title,
    prompt: promptSource.prompt ?? existing.prompt ?? incoming.prompt,
    marks: existing.marks ?? incoming.marks,
    marks_available: existing.marks_available ?? incoming.marks_available ?? existing.marks ?? incoming.marks,
    response_mode: existing.response_mode !== "none" ? existing.response_mode : incoming.response_mode,
    interaction: existing.interaction ?? incoming.interaction,
    markscheme_html: existing.markscheme_html ?? incoming.markscheme_html,
    assets: mergeStringArrays(existing.assets, incoming.assets),
    source_page_start: existing.source_page_start ?? incoming.source_page_start,
    source_page_end: existing.source_page_end ?? incoming.source_page_end,
    source_region_json: existing.source_region_json ?? incoming.source_region_json,
    has_visual_assets: Boolean(existing.has_visual_assets || incoming.has_visual_assets),
    visual_asset_refs: mergeVisualRefs(existing.visual_asset_refs, incoming.visual_asset_refs),
    suggested_topic_tags: mergeStringArrays(existing.suggested_topic_tags, incoming.suggested_topic_tags),
    children: [],
  };
}

function promptRichness(node: Record<string, unknown>) {
  const prompt = isRecord(node.prompt) ? node.prompt : {};
  return `${stringValue(prompt.html) ?? ""}${stringValue(prompt.latex) ?? ""}${stringValue(node.markscheme_html) ?? ""}`.length;
}

function mergeStringArrays(a: unknown, b: unknown) {
  return [...new Set([
    ...(Array.isArray(a) ? a.filter((value): value is string => typeof value === "string") : []),
    ...(Array.isArray(b) ? b.filter((value): value is string => typeof value === "string") : []),
  ])];
}

function mergeVisualRefs(a: unknown, b: unknown) {
  const refs = [
    ...(Array.isArray(a) ? a.filter((value) => typeof value === "string" || isRecord(value)) : []),
    ...(Array.isArray(b) ? b.filter((value) => typeof value === "string" || isRecord(value)) : []),
  ];
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = typeof ref === "string" ? ref : JSON.stringify(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseHierarchyKey(rawKey: string, fallbackOrdinal?: number) {
  const path = ordinalPathForKey(rawKey);
  if (!path.length && fallbackOrdinal) path.push(fallbackOrdinal);
  if (!path.length) return null;
  return {
    normalizedKey: normalizedKeyForPath(path),
    displayLabel: displayLabelForPath(path),
    parentKey: path.length > 1 ? normalizedKeyForPath(path.slice(0, -1)) : null,
    rootKey: `Q${path[0]}`,
    depth: path.length - 1,
    path,
  };
}

function ordinalPathForKey(rawKey: string) {
  const key = rawKey
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.:]+$/g, "")
    .replace(/^(question|problem|q)(\d+)/i, "$2")
    .replace(/^question/i, "")
    .replace(/^problem/i, "")
    .replace(/^q(?=\d)/i, "")
    .replace(/^(\d+)[.)]?([a-z])$/i, "$1($2)")
    .toLowerCase();
  const root = key.match(/^(\d+)/);
  if (!root) return [];
  const path = [Number(root[1])];
  for (const match of key.matchAll(/\(([^()]+)\)/g)) {
    path.push(partOrdinal(match[1] ?? "", path.length));
  }
  return path;
}

function normalizedKeyForPath(path: number[]) {
  if (path.length === 1) return `Q${path[0]}`;
  return `${path[0]}${path.slice(1).map((part, index) => `(${partLabel(part, index + 1)})`).join("")}`;
}

function displayLabelForPath(path: number[]) {
  return normalizedKeyForPath(path);
}

function recordPath(node: Record<string, unknown>) {
  return Array.isArray(node.ordinal_path) ? node.ordinal_path.filter((value): value is number => typeof value === "number") : ordinalPathForKey(String(node.node_key ?? ""));
}

function comparePath(a: number[], b: number[]) {
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left !== right) return left - right;
  }
  return 0;
}

function sortAiTree(nodes: Record<string, unknown>[]) {
  nodes.sort((a, b) => comparePath(recordPath(a), recordPath(b)));
  for (const node of nodes) {
    if (Array.isArray(node.children)) sortAiTree(node.children.filter(isRecord));
  }
}

function partOrdinal(raw: string, depth: number) {
  const token = raw.trim().toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);
  if (/^[ivxlcdm]+$/.test(token) && depth >= 2) return romanToNumber(token);
  if (/^[a-z]+$/.test(token)) return token.split("").reduce((sum, char) => sum * 26 + (char.charCodeAt(0) - 96), 0);
  if (/^[ivxlcdm]+$/.test(token)) return romanToNumber(token);
  return 9999;
}

function partLabel(value: number, depth: number) {
  if (depth === 1) return numberToLetters(value).toLowerCase();
  if (depth === 2) return numberToRoman(value).toLowerCase();
  if (depth === 3) return numberToLetters(value).toUpperCase();
  return String(value);
}

function romanToNumber(raw: string) {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const chars = raw.toLowerCase().split("");
  let total = 0;
  for (let index = 0; index < chars.length; index += 1) {
    const current = values[chars[index]!] ?? 0;
    const next = values[chars[index + 1]!] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
}

function numberToLetters(value: number) {
  let n = Math.max(1, Math.trunc(value));
  let label = "";
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(97 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

function numberToRoman(value: number) {
  const pairs: Array<[number, string]> = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let remaining = Math.max(1, Math.trunc(value));
  let out = "";
  for (const [amount, symbol] of pairs) {
    while (remaining >= amount) {
      out += symbol;
      remaining -= amount;
    }
  }
  return out;
}

function normalizeInteraction(raw: unknown) {
  if (!isRecord(raw)) return undefined;
  const kindStr = String(raw.kind ?? raw.type ?? "").toLowerCase().replaceAll("-", "_");
  let kind: "choice" | "short_text" | "extended_text" | "numerical" = "extended_text";
  if (kindStr.includes("choice")) kind = "choice";
  else if (kindStr.includes("numeric") || kindStr.includes("number") || kindStr.includes("decimal")) kind = "numerical";
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
    min_value: numberValue(raw.min_value) ?? undefined,
    max_value: numberValue(raw.max_value) ?? undefined,
    step: numberValue(raw.step) !== null && numberValue(raw.step)! > 0 ? numberValue(raw.step)! : undefined,
    tolerance: numberValue(raw.tolerance) !== null ? Math.max(0, numberValue(raw.tolerance)!) : undefined,
    unit: stringValue(raw.unit) ?? undefined,
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
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_") : "";
  if (["none", "typed_text", "upload_pdf", "typed_or_upload", "multiple_choice", "numerical"].includes(normalized)) {
    return normalized;
  }
  if (["typed", "text", "written", "essay", "short_answer", "long_answer"].includes(normalized)) return "typed_text";
  if (["choice", "mcq", "multiple_choice_question", "multi_select", "multiple_response"].includes(normalized)) return "multiple_choice";
  if (["numeric", "number", "decimal", "integer", "calculation"].includes(normalized)) return "numerical";
  if (["pdf", "upload", "file_upload", "scan_upload"].includes(normalized)) return "upload_pdf";
  if (["mixed", "typed_upload", "typed_or_pdf"].includes(normalized)) return "typed_or_upload";
  return "typed_or_upload";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function validateNormalizedPackage(result: unknown, expectedQuestionCount?: number) {
  const errors: string[] = [];

  if (!isRecord(result)) {
    errors.push("Output is not an object.");
    return errors;
  }

  const pkg = isRecord(result.normalized_package)
    ? result.normalized_package
    : Array.isArray(result.questions)
      ? result
      : null;

  if (!pkg) errors.push("Missing top-level normalized_package or direct questions array.");

  if ("review_required" in result && result.review_required !== true) {
    errors.push("review_required must be true when provided.");
  }

  if ("warnings" in result && !Array.isArray(result.warnings)) {
    errors.push("warnings must be an array.");
  }

  if ("confidence" in result && typeof result.confidence !== "number") {
    errors.push("confidence must be a number.");
  }

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
    if (!q.response_mode) errors.push(`${q.node_key} missing response_mode.`);

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

    // Short prompts are common in PDF/OCR drafts when the surrounding context is in child nodes,
    // diagrams, or HTML artifacts. They are saved as owner-review warnings during normalization,
    // not rejected as fatal backend validation errors.
  }

  return errors;
}
