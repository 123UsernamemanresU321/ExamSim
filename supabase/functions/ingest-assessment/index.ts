import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { profileForAuthUser, requireOwner } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

type IngestBody = {
  title: string;
  paper_code?: string;
  external_schedule_ref?: string;
  assessment_kind: "practice_paper" | "quiz" | "test" | "exam";
  source_kind: "pdf" | "latex" | "json";
  latex_source?: string;
  json_package?: Record<string, unknown>;
  uploaded_source_path?: string;
};

function latexToNodes(source: string) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nodes = [];
  let ordinal = 1;
  for (const line of lines) {
    if (/^(\\section|question\s+\d+|q\d+|\d+\.)/i.test(line)) {
      nodes.push({
        node_key: String(ordinal),
        ordinal,
        node_type: "question",
        title: line.replace(/^\\section\*?\{?|\}?$/g, ""),
        prompt_latex: line,
        response_mode: "typed_or_upload",
        marks: Number(line.match(/\[(\d+)\s*marks?\]/i)?.[1] ?? 0) || null,
      });
      ordinal += 1;
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

    const parseConfidence = body.source_kind === "json" ? 1 : body.source_kind === "latex" ? 0.62 : 0.15;
    const requiresReview = parseConfidence < 0.9;
    const normalizedPackage =
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
              original_object_path: body.uploaded_source_path,
              normalized_by: "edge-ingest:mvp",
              parse_confidence: parseConfidence,
              requires_owner_review: requiresReview,
            },
            questions: [],
          };

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .insert({
        assessment_id: assessment.id,
        version_no: 1,
        status: requiresReview ? "review_required" : "draft",
        source_kind: body.source_kind,
        source_object_path: body.uploaded_source_path ?? null,
        normalized_package_json: normalizedPackage,
        parse_confidence: parseConfidence,
        requires_owner_review: requiresReview,
      })
      .select("*")
      .single();
    if (versionError) throw versionError;

    const nodes =
      body.source_kind === "json" && Array.isArray(body.json_package?.questions)
        ? body.json_package.questions
        : body.source_kind === "latex"
          ? latexToNodes(body.latex_source ?? "")
          : [{ node_key: "1", ordinal: 1, node_type: "question", title: "PDF manual question tree", response_mode: "typed_or_upload" }];

    const rows = nodes.map((node: Record<string, unknown>, index: number) => ({
      assessment_version_id: version.id,
      node_key: String(node.node_key ?? index + 1),
      ordinal: Number(node.ordinal ?? index + 1),
      node_type: String(node.node_type ?? "question"),
      title: typeof node.title === "string" ? node.title : null,
      prompt_html: typeof node.prompt_html === "string" ? node.prompt_html : typeof node.prompt === "object" ? (node.prompt as { html?: string }).html ?? null : null,
      prompt_latex: typeof node.prompt_latex === "string" ? node.prompt_latex : typeof node.prompt === "object" ? (node.prompt as { latex?: string }).latex ?? null : null,
      marks: typeof node.marks === "number" ? node.marks : null,
      response_mode: String(node.response_mode ?? "typed_or_upload"),
      interaction_json: typeof node.interaction === "object" ? node.interaction : null,
    }));
    const { error: nodeError } = await admin.from("question_nodes").insert(rows);
    if (nodeError) throw nodeError;

    return json({
      assessment_id: assessment.id,
      draft_version_id: version.id,
      parse_confidence: parseConfidence,
      requires_owner_review: requiresReview,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "ingest-assessment failed" }, 401);
  }
});
