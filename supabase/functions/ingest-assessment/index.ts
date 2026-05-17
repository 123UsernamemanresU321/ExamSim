import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwner } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import type { getAdminClient } from "../_shared/supabase.ts";

type IngestBody = {
  title: string;
  paper_code?: string;
  external_schedule_ref?: string;
  assessment_kind: "practice_paper" | "quiz" | "test" | "exam";
  source_kind: "pdf" | "latex" | "json";
  latex_source?: string;
  json_package?: Record<string, unknown>;
  uploaded_source_path?: string;
  pdf_source_base64?: string;
  pdf_source_filename?: string;
  pdf_source_content_type?: string;
  markscheme_source_kind?: "pdf" | "latex" | "json" | "none";
  markscheme_latex_source?: string;
  markscheme_json?: Record<string, unknown>;
  markscheme_pdf_base64?: string;
  markscheme_pdf_filename?: string;
  markscheme_pdf_content_type?: string;
};

type FlatNode = {
  node_key: string;
  ordinal: number;
  node_type: "section" | "question" | "subquestion" | "part";
  title?: string | null;
  prompt_html?: string | null;
  prompt_latex?: string | null;
  marks?: number | null;
  response_mode?: string;
  interaction_json?: unknown;
  markscheme_html?: string | null;
  assets?: string[];
  parent_node_key?: string | null;
};

type AdminClient = ReturnType<typeof getAdminClient>;

const MAX_PDF_SOURCE_BYTES = 10 * 1024 * 1024;

function cleanLatexTitle(line: string) {
  return line
    .replace(/^\\(?:section|subsection|subsubsection)\*?\{(.+)\}$/i, "$1")
    .replace(/^\\(?:begin|end)\{[^}]+\}/i, "")
    .trim();
}

function extractMarks(line: string) {
  const match = line.match(/(?:\[|\()(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)(?:\]|\))/i);
  return match ? Number(match[1]) : null;
}

function extractResponseMode(line: string) {
  if (/(?:multiple\s+choice|choose\s+all|select\s+all|choose\s+one|\\begin\{(?:choices|checkboxes)\}|\\choice\b)/i.test(line)) {
    return "multiple_choice";
  }
  if (/(?:numerical\s+answer|numeric\s+answer|answer\s+as\s+a\s+number|give\s+your\s+answer\s+to|decimal\s+places?)/i.test(line)) {
    return "numerical";
  }
  return "typed_or_upload";
}

function extractInteraction(line: string) {
  const responseMode = extractResponseMode(line);
  if (responseMode === "numerical") return { kind: "numerical" };
  if (responseMode !== "multiple_choice") return null;

  const choices = [...line.matchAll(/\b([A-H])[\).:]\s*([^A-H]+?)(?=\s+[A-H][\).:]|$)/g)]
    .map((match) => ({ choice_id: match[1].toLowerCase(), content_html: `<p>${escapeHtml(match[2].trim())}</p>` }))
    .filter((choice) => choice.content_html !== "<p></p>");
  return {
    kind: "choice",
    max_choices: /(?:choose|select)\s+(?:all|two|three|more than one)|multiple\s+answers?/i.test(line) ? Math.max(2, choices.length || 2) : 1,
    choices: choices.length ? choices : undefined,
  };
}

function latexToNodes(source: string): FlatNode[] {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nodes: FlatNode[] = [];
  let questionOrdinal = 1;
  let sectionOrdinal = 1;
  let subOrdinal = 1;
  let partOrdinal = 1;
  let currentQuestionKey: string | null = null;
  let currentSubquestionKey: string | null = null;

  for (const line of lines) {
    const section = line.match(/^\\(?:section|subsection)\*?\{(.+)\}$/i);
    const question = line.match(/^(?:\\question\b|question\s+|q)(\d+)[.)\s:]*/i) ?? line.match(/^(\d+)[.)]\s+/);
    const subquestion = line.match(/^(?:\\item\s*)?\(([a-z])\)\s+/i);
    const romanPart = line.match(/^(?:\\item\s*)?\((i{1,3}|iv|v|vi{0,3}|ix|x)\)\s+/i);

    if (section) {
      nodes.push({
        node_key: `S${sectionOrdinal}`,
        ordinal: sectionOrdinal,
        node_type: "section",
        title: cleanLatexTitle(line),
        prompt_latex: line,
        response_mode: "none",
        marks: null,
      });
      sectionOrdinal += 1;
      continue;
    }

    if (question) {
      currentQuestionKey = String(question[1] ?? questionOrdinal);
      currentSubquestionKey = null;
      subOrdinal = 1;
      partOrdinal = 1;
      nodes.push({
        node_key: currentQuestionKey,
        ordinal: questionOrdinal,
        node_type: "question",
        title: cleanLatexTitle(line),
        prompt_latex: line,
        response_mode: extractResponseMode(line),
        interaction_json: extractInteraction(line),
        marks: extractMarks(line),
      });
      questionOrdinal += 1;
      continue;
    }

    if (subquestion && currentQuestionKey) {
      const label = subquestion[1].toLowerCase();
      currentSubquestionKey = `${currentQuestionKey}(${label})`;
      partOrdinal = 1;
      nodes.push({
        node_key: currentSubquestionKey,
        parent_node_key: currentQuestionKey,
        ordinal: subOrdinal,
        node_type: "subquestion",
        title: `Part (${label})`,
        prompt_latex: line,
        response_mode: extractResponseMode(line),
        interaction_json: extractInteraction(line),
        marks: extractMarks(line),
      });
      subOrdinal += 1;
      continue;
    }

    if (romanPart && (currentSubquestionKey || currentQuestionKey)) {
      const label = romanPart[1].toLowerCase();
      nodes.push({
        node_key: `${currentSubquestionKey ?? currentQuestionKey}(${label})`,
        parent_node_key: currentSubquestionKey ?? currentQuestionKey,
        ordinal: partOrdinal,
        node_type: "part",
        title: `Part (${label})`,
        prompt_latex: line,
        response_mode: extractResponseMode(line),
        interaction_json: extractInteraction(line),
        marks: extractMarks(line),
      });
      partOrdinal += 1;
    }
  }
  return nodes.length > 0
    ? nodes
    : [{ node_key: "1", ordinal: 1, node_type: "question", title: "Manual review required", prompt_latex: source.slice(0, 500), response_mode: "typed_or_upload" }];
}

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwner(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<IngestBody>(request);
    if (!body.title || !body.assessment_kind || !body.source_kind) return json({ error: "Missing assessment fields" }, 400);

    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .insert({
        owner_profile_id: profile.id,
        title: body.title,
        paper_code: body.paper_code ?? null,
        external_schedule_ref: body.external_schedule_ref ?? null,
        assessment_kind: body.assessment_kind,
      })
      .select("*")
      .single();
    if (assessmentError) throw assessmentError;

    const versionId = crypto.randomUUID();
    const sourceObjectPath = body.source_kind === "pdf"
      ? await resolvePdfSourceObjectPath(admin, profile.id, assessment.id, versionId, body)
      : body.source_kind === "latex" && body.latex_source
        ? await storeTextSource(admin, profile.id, assessment.id, versionId, "source.tex", body.latex_source, "application/x-tex")
        : body.uploaded_source_path ?? null;
    const markschemeSource = await resolveMarkschemeSource(admin, profile.id, assessment.id, versionId, body);

    const parseConfidence = body.source_kind === "json" ? 1 : body.source_kind === "latex" ? 0.62 : 0.15;
    const requiresReview = parseConfidence < 0.9;
    const baseNormalizedPackage =
      body.source_kind === "json" && body.json_package
        ? body.json_package
        : {
            schema_version: "2026-05-05",
            assessment: {
              id: assessment.id,
              title: assessment.title,
              paper_code: assessment.paper_code,
              assessment_kind: assessment.assessment_kind,
              source_kind: body.source_kind,
              authoring_origin: body.source_kind === "pdf" ? "owner_uploaded" : "owner_pasted",
              external_schedule_ref: body.external_schedule_ref,
              display_timezone: "Africa/Johannesburg",
              markscheme_html: markschemeSource.html,
            },
            delivery: {
              delivery_mode: "browser",
              solutions_requested: true,
              response_policy: {
                typed_allowed: true,
                mixed_mode_allowed: true,
                per_question_pdf_upload: true,
                blank_submission_required_for_unattempted: false,
              },
            },
            source: {
              original_object_path: sourceObjectPath ?? undefined,
              normalized_by: "edge-ingest:mvp",
              parse_confidence: parseConfidence,
              requires_owner_review: requiresReview,
            },
            questions: [],
          };
    const normalizedPackage = mergeMarkschemeIntoPackage(baseNormalizedPackage, markschemeSource.json, markschemeSource.html);

    const packageStorage = await storeNormalizedPackageObject(admin, profile.id, versionId, normalizedPackage);
    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .insert({
        id: versionId,
        assessment_id: assessment.id,
        version_no: 1,
        status: requiresReview ? "review_required" : "draft",
        source_kind: body.source_kind,
        source_object_path: sourceObjectPath,
        normalized_package_json: packageStorage.encrypted_package_path ? null : normalizedPackage,
        markscheme_html: (normalizedPackage as any).assessment?.markscheme_html ?? markschemeSource.html,
        markscheme_pdf_path: markschemeSource.pdfPath,
        markscheme_source_kind: markschemeSource.kind,
        markscheme_source_object_path: markschemeSource.objectPath,
        parse_confidence: parseConfidence,
        requires_owner_review: requiresReview,
        ...packageStorage,
      })
      .select("*")
      .single();
    if (versionError) throw versionError;

    const nodes: FlatNode[] =
      body.source_kind === "json" && Array.isArray(body.json_package?.questions)
        ? flattenPackageNodes(body.json_package.questions as Record<string, unknown>[])
        : body.source_kind === "latex"
          ? latexToNodes(body.latex_source ?? "")
          : [{
              node_key: "document-review",
              ordinal: 1,
              node_type: "section",
              title: "PDF review required",
              prompt_html: "The uploaded PDF has not been converted into question nodes yet. Run MinerU/AI parse or create the question tree manually; do not publish this placeholder.",
              response_mode: "none",
            } as FlatNode];

    const rows = nodes.map((node: Record<string, unknown>, index: number) => ({
      assessment_version_id: version.id,
      node_key: String(node.node_key ?? index + 1),
      ordinal: Number(node.ordinal ?? index + 1),
      node_type: String(node.node_type ?? "question"),
      title: typeof node.title === "string" ? node.title : null,
      prompt_html: typeof node.prompt_html === "string" ? node.prompt_html : typeof node.prompt === "object" ? (node.prompt as { html?: string }).html ?? null : null,
      prompt_latex: typeof node.prompt_latex === "string" ? node.prompt_latex : typeof node.prompt === "object" ? (node.prompt as { latex?: string }).latex ?? null : null,
      marks: typeof node.marks === "number" ? node.marks : null,
      response_mode: normalizeResponseMode(node.response_mode),
      interaction_json: typeof node.interaction_json === "object" ? node.interaction_json : typeof node.interaction === "object" ? node.interaction : null,
      markscheme_html: typeof node.markscheme_html === "string" ? node.markscheme_html : null,
      assets: Array.isArray(node.assets) ? node.assets : [],
      source_page_start: typeof node.source_page_start === "number" ? node.source_page_start : null,
      source_page_end: typeof node.source_page_end === "number" ? node.source_page_end : null,
    }));
    const { data: insertedNodes, error: nodeError } = await admin.from("question_nodes").insert(rows).select("id,node_key");
    if (nodeError) throw nodeError;

    const idByKey = new Map((insertedNodes ?? []).map((node) => [node.node_key, node.id]));
    for (const node of nodes) {
      if (!node.parent_node_key) continue;
      const parentId = idByKey.get(String(node.parent_node_key));
      const nodeId = idByKey.get(String(node.node_key));
      if (parentId && nodeId) {
        await admin.from("question_nodes").update({ parent_node_id: parentId }).eq("id", nodeId);
      }
    }

    let parseJobId: string | null = null;
    if (body.source_kind === "pdf" && sourceObjectPath) {
      const { data: parseJob, error: parseJobError } = await admin
        .from("parse_jobs")
        .insert({
          assessment_version_id: version.id,
          owner_profile_id: profile.id,
          source_object_path: sourceObjectPath,
          parser: Deno.env.get("MINERU_PROVIDER") === "hosted" ? "mineru_hosted" : "mineru",
          status: "queued",
          requested_ocr: true,
          external_provider: Deno.env.get("MINERU_PROVIDER") === "hosted" ? "mineru_hosted" : null,
          metadata_json: {
            parse_purpose: "paper",
            provider_mode: Deno.env.get("MINERU_PROVIDER") === "hosted" ? "hosted" : "self_hosted",
          },
        })
        .select("id")
        .single();
      if (parseJobError) throw parseJobError;
      parseJobId = parseJob.id;
    }

    let markschemeParseJobId: string | null = null;
    if (markschemeSource.kind === "pdf" && markschemeSource.objectPath) {
      const { data: parseJob, error: parseJobError } = await admin
        .from("parse_jobs")
        .insert({
          assessment_version_id: version.id,
          owner_profile_id: profile.id,
          source_object_path: markschemeSource.objectPath,
          parser: Deno.env.get("MINERU_PROVIDER") === "hosted" ? "mineru_hosted" : "mineru",
          status: "queued",
          requested_ocr: true,
          external_provider: Deno.env.get("MINERU_PROVIDER") === "hosted" ? "mineru_hosted" : null,
          metadata_json: {
            parse_purpose: "markscheme",
            provider_mode: Deno.env.get("MINERU_PROVIDER") === "hosted" ? "hosted" : "self_hosted",
          },
        })
        .select("id")
        .single();
      if (parseJobError) throw parseJobError;
      markschemeParseJobId = parseJob.id;
    }

    await auditOwnerAction(profile.id, user.id, "assessment.ingested", "assessment_versions", version.id, {
      source_kind: body.source_kind,
      parse_job_id: parseJobId,
      markscheme_source_kind: markschemeSource.kind,
      markscheme_parse_job_id: markschemeParseJobId,
    });

    return json({
      assessment_id: assessment.id,
      draft_version_id: version.id,
      parse_confidence: parseConfidence,
      requires_owner_review: requiresReview,
      parse_job_id: parseJobId,
      markscheme_parse_job_id: markschemeParseJobId,
    });
  } catch (error) {
    console.error("Ingest assessment error:", error);
    return errorResponse(error, "ingest-assessment failed");
  }
});

async function resolvePdfSourceObjectPath(
  admin: AdminClient,
  ownerProfileId: string,
  assessmentId: string,
  versionId: string,
  body: IngestBody,
) {
  if (body.pdf_source_base64) {
    const bytes = decodeBase64Pdf(body.pdf_source_base64);
    if (bytes.byteLength === 0) throw new Error("The uploaded PDF is empty");
    if (bytes.byteLength > MAX_PDF_SOURCE_BYTES) throw new Error("PDF source uploads must be 10MB or smaller");
    if (!isPdf(bytes)) throw new Error("The uploaded source file is not a valid PDF");
    const filename = safeFilename(body.pdf_source_filename ?? "source.pdf");
    const objectPath = `${ownerProfileId}/assessments/${assessmentId}/versions/${versionId}/${filename}`;
    const { error } = await admin.storage.from("assessment-sources").upload(objectPath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (error) throw error;
    return objectPath;
  }
  if (body.uploaded_source_path?.trim()) return body.uploaded_source_path.trim();
  throw new Error("Choose a PDF file to upload");
}

async function resolveMarkschemeSource(
  admin: AdminClient,
  ownerProfileId: string,
  assessmentId: string,
  versionId: string,
  body: IngestBody,
) {
  const kind = body.markscheme_source_kind === "none" ? undefined : body.markscheme_source_kind;
  if (!kind) return { kind: null, objectPath: null, html: null, pdfPath: null, json: null };

  if (kind === "pdf") {
    if (!body.markscheme_pdf_base64) throw new Error("Choose a markscheme PDF file or set markscheme source to none.");
    const objectPath = await storePdfSourceObject(
      admin,
      ownerProfileId,
      assessmentId,
      versionId,
      body.markscheme_pdf_base64,
      body.markscheme_pdf_filename ?? "markscheme.pdf",
      "markscheme",
    );
    return { kind, objectPath, html: null, pdfPath: objectPath, json: null };
  }

  if (kind === "latex") {
    const source = body.markscheme_latex_source?.trim();
    if (!source) throw new Error("Paste the LaTeX markscheme or set markscheme source to none.");
    const objectPath = await storeTextSource(admin, ownerProfileId, assessmentId, versionId, "markscheme.tex", source, "application/x-tex");
    return { kind, objectPath, html: markschemeTextToHtml(source, "LaTeX markscheme source"), pdfPath: null, json: null };
  }

  const markschemeJson = body.markscheme_json;
  if (!markschemeJson || typeof markschemeJson !== "object") throw new Error("Paste valid markscheme JSON or set markscheme source to none.");
  const objectPath = await storeTextSource(
    admin,
    ownerProfileId,
    assessmentId,
    versionId,
    "markscheme.json",
    JSON.stringify(markschemeJson, null, 2),
    "application/json",
  );
  return {
    kind,
    objectPath,
    html: extractGlobalMarkschemeHtml(markschemeJson),
    pdfPath: null,
    json: markschemeJson,
  };
}

async function storePdfSourceObject(
  admin: AdminClient,
  ownerProfileId: string,
  assessmentId: string,
  versionId: string,
  base64Source: string,
  filename: string,
  prefix: string,
) {
  const bytes = decodeBase64Pdf(base64Source);
  if (bytes.byteLength === 0) throw new Error("The uploaded PDF is empty");
  if (bytes.byteLength > MAX_PDF_SOURCE_BYTES) throw new Error("PDF source uploads must be 10MB or smaller");
  if (!isPdf(bytes)) throw new Error("The uploaded source file is not a valid PDF");
  const objectPath = `${ownerProfileId}/assessments/${assessmentId}/versions/${versionId}/${prefix}-${safeFilename(filename)}`;
  const { error } = await admin.storage.from("assessment-sources").upload(objectPath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  return objectPath;
}

async function storeTextSource(
  admin: AdminClient,
  ownerProfileId: string,
  assessmentId: string,
  versionId: string,
  filename: string,
  source: string,
  contentType: string,
) {
  const bytes = new TextEncoder().encode(source);
  const objectPath = `${ownerProfileId}/assessments/${assessmentId}/versions/${versionId}/${filename}`;
  const { error } = await admin.storage.from("assessment-sources").upload(objectPath, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return objectPath;
}

function decodeBase64Pdf(value: string) {
  const normalized = value.replace(/^data:application\/pdf;base64,/i, "").replace(/\s/g, "");
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}

function isPdf(bytes: Uint8Array) {
  return bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;
}

function safeFilename(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.endsWith(".pdf") ? cleaned : `${cleaned || "source"}.pdf`;
}

function flattenPackageNodes(nodes: Record<string, unknown>[], parentNodeKey: string | null = null): FlatNode[] {
  const flattened: FlatNode[] = [];
  nodes.forEach((node, index) => {
    const nodeKey = String(node.node_key ?? node.node_id ?? index + 1);
    const prompt = typeof node.prompt === "object" && node.prompt ? node.prompt as { html?: string; latex?: string } : {};
    flattened.push({
      node_key: nodeKey,
      parent_node_key: parentNodeKey,
      ordinal: Number(node.ordinal ?? index + 1),
      node_type: String(node.node_type ?? "question") as FlatNode["node_type"],
      title: typeof node.title === "string" ? node.title : null,
      prompt_html: typeof node.prompt_html === "string" ? node.prompt_html : prompt.html ?? null,
      prompt_latex: typeof node.prompt_latex === "string" ? node.prompt_latex : prompt.latex ?? null,
      marks: typeof node.marks === "number" ? node.marks : null,
      response_mode: normalizeResponseMode(node.response_mode),
      interaction_json: typeof node.interaction_json === "object" ? node.interaction_json : typeof node.interaction === "object" ? node.interaction : null,
      markscheme_html: typeof node.markscheme_html === "string" ? node.markscheme_html : null,
      assets: Array.isArray(node.assets) ? node.assets : [],
    });
    if (Array.isArray(node.children)) {
      flattened.push(...flattenPackageNodes(node.children as Record<string, unknown>[], nodeKey));
    }
  });
  return flattened;
}

function normalizeResponseMode(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_") : "";
  if (["none", "typed_text", "upload_pdf", "typed_or_upload", "multiple_choice", "numerical"].includes(normalized)) return normalized;
  if (["typed", "text", "written", "essay", "short_answer", "long_answer"].includes(normalized)) return "typed_text";
  if (["choice", "mcq", "multiple_choice_question", "multi_select", "multiple_response"].includes(normalized)) return "multiple_choice";
  if (["numeric", "number", "decimal", "integer", "calculation"].includes(normalized)) return "numerical";
  if (["pdf", "upload", "file_upload", "scan_upload"].includes(normalized)) return "upload_pdf";
  if (["mixed", "typed_upload", "typed_or_pdf"].includes(normalized)) return "typed_or_upload";
  return "typed_or_upload";
}

function mergeMarkschemeIntoPackage(
  basePackage: Record<string, unknown>,
  markschemeJson: Record<string, unknown> | null,
  markschemeHtml: string | null,
) {
  if (!markschemeJson && !markschemeHtml) return basePackage;
  const packageCopy = structuredClone(basePackage) as Record<string, unknown>;
  const assessment = isRecord(packageCopy.assessment) ? packageCopy.assessment : {};
  const globalHtml = extractGlobalMarkschemeHtml(markschemeJson) ?? markschemeHtml;
  packageCopy.assessment = {
    ...assessment,
    markscheme_html: globalHtml ?? stringValue(assessment.markscheme_html) ?? undefined,
  };

  const markschemeByKey = markschemeJson ? flattenMarkschemeNodes(markschemeJson) : new Map<string, Record<string, unknown>>();
  if (Array.isArray(packageCopy.questions) && markschemeByKey.size > 0) {
    applyMarkschemeNodes(packageCopy.questions as Record<string, unknown>[], markschemeByKey);
  }
  return packageCopy;
}

function applyMarkschemeNodes(nodes: Record<string, unknown>[], markschemeByKey: Map<string, Record<string, unknown>>) {
  for (const node of nodes) {
    const key = stringValue(node.node_key) ?? stringValue(node.node_id);
    const markschemeNode = key ? markschemeByKey.get(key) : undefined;
    if (markschemeNode) {
      const markschemePrompt = isRecord(markschemeNode.prompt) ? markschemeNode.prompt : {};
      const nodeMarkschemeHtml =
        stringValue(markschemeNode.markscheme_html) ??
        stringValue(markschemeNode.marking_guide_html) ??
        stringValue(markschemePrompt.html) ??
        stringValue(markschemePrompt.latex);
      const marks = numberValue(markschemeNode.marks) ?? numberValue(markschemeNode.max_marks);
      if (nodeMarkschemeHtml) node.markscheme_html = nodeMarkschemeHtml;
      if (marks !== null) node.marks = marks;
    }
    if (Array.isArray(node.children)) applyMarkschemeNodes(node.children as Record<string, unknown>[], markschemeByKey);
  }
}

function flattenMarkschemeNodes(source: Record<string, unknown>) {
  const map = new Map<string, Record<string, unknown>>();
  const questions = Array.isArray(source.questions)
    ? source.questions
    : Array.isArray(source.nodes)
      ? source.nodes
      : isRecord(source.normalized_package) && Array.isArray(source.normalized_package.questions)
        ? source.normalized_package.questions
        : [];

  function visit(rawNode: unknown) {
    if (!isRecord(rawNode)) return;
    const key = stringValue(rawNode.node_key) ?? stringValue(rawNode.node_id);
    if (key) map.set(key, rawNode);
    if (Array.isArray(rawNode.children)) rawNode.children.forEach(visit);
  }
  questions.forEach(visit);
  return map;
}

function extractGlobalMarkschemeHtml(source: Record<string, unknown> | null) {
  if (!source) return null;
  const assessment = isRecord(source.assessment) ? source.assessment : {};
  return (
    stringValue(source.markscheme_html) ??
    stringValue(source.marking_guide_html) ??
    stringValue(assessment.markscheme_html) ??
    stringValue(assessment.marking_guide_html)
  );
}

function markschemeTextToHtml(source: string, label: string) {
  return `<p><strong>${escapeHtml(label)}</strong></p><pre>${escapeHtml(source)}</pre>`;
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

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function storeNormalizedPackageObject(
  admin: AdminClient,
  ownerProfileId: string,
  versionId: string,
  normalizedPackage: unknown,
) {
  const plaintext = new TextEncoder().encode(JSON.stringify(normalizedPackage, null, 2));
  const basePath = `${ownerProfileId}/versions/${versionId}/normalized-package.json`;
  const encrypted = await maybeEncrypt(plaintext);
  const objectPath = encrypted ? `${basePath}.enc` : basePath;
  const { error } = await admin.storage.from("assessment-packages").upload(objectPath, encrypted?.ciphertextBytes ?? plaintext, {
    contentType: encrypted ? "application/octet-stream" : "application/json",
    upsert: false,
  });
  if (error) throw error;
  if (encrypted) {
    const { error: envelopeError } = await admin
      .from("encrypted_object_envelopes")
      .insert({
        owner_profile_id: ownerProfileId,
        bucket_id: "assessment-packages",
        object_path: objectPath,
        kms_provider: "cloudflare",
        algorithm: "AES-GCM",
        wrapped_data_key: encrypted.wrappedDataKey,
        iv: encrypted.iv,
        metadata_json: { purpose: "assessment_package", assessment_version_id: versionId },
      })
      .select("id")
      .single();
    if (envelopeError) throw envelopeError;
    return {
      encrypted_package_path: objectPath,
      kms_provider: "cloudflare",
      wrapped_data_key: encrypted.wrappedDataKey,
      encryption_metadata_json: { algorithm: "AES-GCM", iv: encrypted.iv, purpose: "assessment_package" },
    };
  }
  return { normalized_package_path: objectPath };
}

async function maybeEncrypt(plaintextBytes: Uint8Array) {
  if (Deno.env.get("EXTERNAL_KMS_PROVIDER") !== "cloudflare") return null;
  const wrapUrl = Deno.env.get("EXTERNAL_KMS_WRAP_URL");
  const adminToken = Deno.env.get("EXTERNAL_KMS_ADMIN_TOKEN");
  if (!wrapUrl || !adminToken) throw new Error("Cloudflare KMS wrapper is not configured");
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", dataKey, "AES-GCM", false, ["encrypt"]);
  const ciphertextBytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array(plaintextBytes)));
  const wrapResponse = await fetch(wrapUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ plaintextDataKey: base64(dataKey) }),
  });
  if (!wrapResponse.ok) throw new Error("Cloudflare KMS key wrap failed");
  const wrapped = await wrapResponse.json();
  if (typeof wrapped.wrappedDataKey !== "string") throw new Error("Cloudflare KMS returned invalid wrapped key");
  return { ciphertextBytes, wrappedDataKey: wrapped.wrappedDataKey, iv: base64(iv) };
}

function base64(value: Uint8Array) {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""));
}
