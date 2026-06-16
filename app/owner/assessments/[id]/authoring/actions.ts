"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerProfileId } from "@/lib/examsim/session-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateQuestionCardAction(assessmentId: string, formData: FormData) {
  const questionNodeId = String(formData.get("question_node_id") ?? "");
  const responseMode = String(formData.get("response_mode") ?? "none");
  const marksRaw = String(formData.get("marks") ?? "");
  const title = String(formData.get("title") ?? "").trim() || null;
  const sourcePageStart = Number(formData.get("source_page_start") ?? 0) || null;
  const sourcePageEnd = Number(formData.get("source_page_end") ?? 0) || null;
  if (!questionNodeId) throw new Error("question_node_id is required");
  if (!["none", "typed_text", "upload_pdf", "typed_or_upload", "multiple_choice", "numerical"].includes(responseMode)) {
    throw new Error("Invalid response mode");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("question_nodes")
    .update({
      title,
      marks: marksRaw === "" ? null : Number(marksRaw),
      response_mode: responseMode as "none" | "typed_text" | "upload_pdf" | "typed_or_upload" | "multiple_choice" | "numerical",
      source_page_start: sourcePageStart,
      source_page_end: sourcePageEnd,
    })
    .eq("id", questionNodeId);
  if (error) throw error;
  revalidatePath(`/owner/assessments/${assessmentId}/authoring`);
}

export async function createSourceRegionAction(assessmentId: string, versionId: string, formData: FormData) {
  const sourceDocumentId = String(formData.get("source_document_id") ?? "");
  if (!sourceDocumentId) throw new Error("source_document_id is required");
  const regionType = readRegionType(formData.get("region_type"));
  const bbox = readNormalizedBbox(formData);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("question_source_regions").insert({
    assessment_version_id: versionId,
    source_document_id: sourceDocumentId,
    question_node_id: String(formData.get("question_node_id") || "") || null,
    source_page_id: String(formData.get("source_page_id") || "") || null,
    node_key: String(formData.get("node_key") || "") || null,
    region_type: regionType,
    status: "needs_review",
    confidence: 0.5,
    bbox_json: bbox,
  });
  if (error) throw error;
  revalidatePath(`/owner/assessments/${assessmentId}/compiler`);
  revalidatePath(`/owner/assessments/${assessmentId}/authoring`);
}

export async function updateSourceRegionAction(assessmentId: string, versionId: string, formData: FormData) {
  const regionId = String(formData.get("region_id") ?? "");
  if (!regionId) throw new Error("region_id is required");
  const regionType = readRegionType(formData.get("region_type"));
  const status = readRegionStatus(formData.get("status"));
  const confidence = readConfidence(formData.get("confidence"));
  const bbox = readNormalizedBbox(formData);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("question_source_regions")
    .update({
      question_node_id: String(formData.get("question_node_id") || "") || null,
      source_page_id: String(formData.get("source_page_id") || "") || null,
      node_key: String(formData.get("node_key") || "") || null,
      region_type: regionType,
      status,
      confidence,
      bbox_json: bbox,
    })
    .eq("id", regionId)
    .eq("assessment_version_id", versionId);
  if (error) throw error;
  await syncQuestionNodeSourceAnchor(versionId, regionId);
  revalidatePath(`/owner/assessments/${assessmentId}/compiler`);
  revalidatePath(`/owner/assessments/${assessmentId}/authoring`);
}

export async function ignoreSourceRegionAction(assessmentId: string, versionId: string, formData: FormData) {
  const regionId = String(formData.get("region_id") ?? "");
  if (!regionId) throw new Error("region_id is required");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("question_source_regions")
    .update({ status: "ignored" })
    .eq("id", regionId)
    .eq("assessment_version_id", versionId);
  if (error) throw error;
  revalidatePath(`/owner/assessments/${assessmentId}/compiler`);
  revalidatePath(`/owner/assessments/${assessmentId}/authoring`);
}

export async function splitSourceRegionAction(assessmentId: string, versionId: string, formData: FormData) {
  const regionId = String(formData.get("region_id") ?? "");
  const axis = String(formData.get("axis") ?? "vertical") === "horizontal" ? "horizontal" : "vertical";
  if (!regionId) throw new Error("region_id is required");
  const supabase = await createSupabaseServerClient();
  const { data: region, error: regionError } = await supabase
    .from("question_source_regions")
    .select("*")
    .eq("id", regionId)
    .eq("assessment_version_id", versionId)
    .maybeSingle();
  if (regionError) throw regionError;
  if (!region) throw new Error("Source region not found");

  const bbox = normalizeBboxObject(region.bbox_json);
  const first = { ...bbox };
  const second = { ...bbox };
  if (axis === "horizontal") {
    first.height = clampUnit(bbox.height / 2);
    second.y = clampUnit(bbox.y + first.height);
    second.height = clampUnit(bbox.height - first.height);
  } else {
    first.width = clampUnit(bbox.width / 2);
    second.x = clampUnit(bbox.x + first.width);
    second.width = clampUnit(bbox.width - first.width);
  }

  const { error: updateError } = await supabase
    .from("question_source_regions")
    .update({ bbox_json: first, status: "needs_review", confidence: 0.5 })
    .eq("id", regionId)
    .eq("assessment_version_id", versionId);
  if (updateError) throw updateError;

  const { error: insertError } = await supabase.from("question_source_regions").insert({
    assessment_version_id: versionId,
    source_document_id: region.source_document_id,
    source_page_id: region.source_page_id,
    question_node_id: null,
    node_key: region.node_key ? `${region.node_key} split` : null,
    region_type: region.region_type,
    status: "needs_review",
    confidence: 0.5,
    bbox_json: second,
    metadata_json: { split_from_region_id: regionId, split_axis: axis },
  });
  if (insertError) throw insertError;
  revalidatePath(`/owner/assessments/${assessmentId}/compiler`);
  revalidatePath(`/owner/assessments/${assessmentId}/authoring`);
}

export async function mergeSourceRegionsAction(assessmentId: string, versionId: string, formData: FormData) {
  const primaryId = String(formData.get("primary_region_id") ?? "");
  const secondaryId = String(formData.get("secondary_region_id") ?? "");
  if (!primaryId || !secondaryId || primaryId === secondaryId) throw new Error("Choose two different regions to merge");
  const supabase = await createSupabaseServerClient();
  const { data: regions, error: regionError } = await supabase
    .from("question_source_regions")
    .select("*")
    .eq("assessment_version_id", versionId)
    .in("id", [primaryId, secondaryId]);
  if (regionError) throw regionError;
  const primary = regions?.find((region) => region.id === primaryId);
  const secondary = regions?.find((region) => region.id === secondaryId);
  if (!primary || !secondary) throw new Error("Both source regions must exist");
  if (primary.source_document_id !== secondary.source_document_id || primary.source_page_id !== secondary.source_page_id) {
    throw new Error("Only regions on the same source page can be merged");
  }

  const merged = mergeBboxes(normalizeBboxObject(primary.bbox_json), normalizeBboxObject(secondary.bbox_json));
  const { error: updateError } = await supabase
    .from("question_source_regions")
    .update({ bbox_json: merged, status: "needs_review", confidence: Math.min(Number(primary.confidence ?? 0.5), Number(secondary.confidence ?? 0.5)) })
    .eq("id", primaryId)
    .eq("assessment_version_id", versionId);
  if (updateError) throw updateError;
  const { error: ignoreError } = await supabase
    .from("question_source_regions")
    .update({ status: "ignored", metadata_json: { merged_into_region_id: primaryId } })
    .eq("id", secondaryId)
    .eq("assessment_version_id", versionId);
  if (ignoreError) throw ignoreError;
  revalidatePath(`/owner/assessments/${assessmentId}/compiler`);
  revalidatePath(`/owner/assessments/${assessmentId}/authoring`);
}

export async function createLatexDraftAction(assessmentId: string, formData: FormData) {
  const ownerProfileId = await requireOwnerProfileId();
  const latexSource = String(formData.get("latex_source") ?? "").trim();
  if (latexSource.length < 10) throw new Error("LaTeX source is too short to import.");
  if (latexSource.length > 200_000) throw new Error("LaTeX source is too large for inline draft import.");

  const supabase = await createSupabaseServerClient();
  const { data: versions, error: versionError } = await supabase
    .from("assessment_versions")
    .select("id")
    .eq("assessment_id", assessmentId)
    .order("version_no", { ascending: false })
    .limit(1);
  if (versionError) throw versionError;
  const versionId = versions?.[0]?.id;
  if (!versionId) throw new Error("No assessment version is available for LaTeX import.");

  const { error } = await supabase.from("parse_jobs").insert({
    assessment_version_id: versionId,
    owner_profile_id: ownerProfileId,
    source_object_path: `inline-latex://${assessmentId}/${crypto.randomUUID()}.tex`,
    parser: "latex_deterministic",
    status: "review_required",
    requested_ocr: false,
    metadata_json: {
      import_mode: "manual_latex_draft",
      source_preview: latexSource.slice(0, 4000),
      warning: "Inline LaTeX draft requires owner review before publishing. Use ingest-assessment for file-backed imports.",
    },
  });
  if (error) throw error;
  revalidatePath(`/owner/assessments/${assessmentId}/latex`);
  revalidatePath(`/owner/assessments/${assessmentId}/review`);
}

export async function createRubricTemplateAction(assessmentId: string, formData: FormData) {
  const ownerProfileId = await requireOwnerProfileId();
  const supabase = await createSupabaseServerClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Rubric name is required");
  const { error } = await supabase.from("rubric_templates").insert({
    owner_profile_id: ownerProfileId,
    name,
    subject: String(formData.get("subject") || "") || null,
    description: String(formData.get("description") || "") || null,
  });
  if (error) throw error;
  revalidatePath(`/owner/assessments/${assessmentId}/rubrics`);
}

export async function createRubricTemplateItemAction(assessmentId: string, formData: FormData) {
  const rubricTemplateId = String(formData.get("rubric_template_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const maxMarks = Number(formData.get("max_marks") ?? 1);
  if (!rubricTemplateId) throw new Error("rubric_template_id is required");
  if (!label) throw new Error("Rubric item label is required");
  if (!Number.isFinite(maxMarks) || maxMarks < 0) throw new Error("Rubric item marks must be zero or greater");
  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("rubric_template_items")
    .select("ordinal")
    .eq("rubric_template_id", rubricTemplateId)
    .order("ordinal", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  const ordinal = Number(existing?.[0]?.ordinal ?? 0) + 1;
  const { error } = await supabase.from("rubric_template_items").insert({
    rubric_template_id: rubricTemplateId,
    ordinal,
    label,
    description: String(formData.get("description") || "") || null,
    max_marks: maxMarks,
    mark_code: String(formData.get("mark_code") || "") || null,
    feedback_text: String(formData.get("feedback_text") || "") || null,
  });
  if (error) throw error;
  revalidatePath(`/owner/assessments/${assessmentId}/rubrics`);
}

async function syncQuestionNodeSourceAnchor(versionId: string, regionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: region, error: regionError } = await supabase
    .from("question_source_regions")
    .select("question_node_id,bbox_json,status")
    .eq("id", regionId)
    .eq("assessment_version_id", versionId)
    .maybeSingle();
  if (regionError) throw regionError;
  if (!region?.question_node_id || region.status === "ignored") return;
  const bbox = normalizeBboxObject(region.bbox_json);
  const page = bbox.page;
  const { error } = await supabase
    .from("question_nodes")
    .update({
      source_page_start: page,
      source_page_end: page,
      source_region_json: bbox,
      has_visual_assets: true,
    })
    .eq("id", region.question_node_id)
    .eq("assessment_version_id", versionId);
  if (error) throw error;
}

function readRegionType(value: FormDataEntryValue | null) {
  const raw = String(value ?? "question");
  const allowed = ["question", "subquestion", "diagram", "table", "answer_area", "markscheme", "instructions", "other"] as const;
  return (allowed as readonly string[]).includes(raw) ? raw as typeof allowed[number] : "question";
}

function readRegionStatus(value: FormDataEntryValue | null) {
  const raw = String(value ?? "needs_review");
  const allowed = ["detected", "approved", "needs_review", "ignored"] as const;
  return (allowed as readonly string[]).includes(raw) ? raw as typeof allowed[number] : "needs_review";
}

function readConfidence(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0.5);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.min(1, Math.max(0, parsed));
}

function readNormalizedBbox(formData: FormData) {
  const bbox = {
    page: Math.max(1, Math.floor(Number(formData.get("page_number") ?? 1) || 1)),
    x: Number(formData.get("x") ?? 0),
    y: Number(formData.get("y") ?? 0),
    width: Number(formData.get("width") ?? 1),
    height: Number(formData.get("height") ?? 1),
    normalized: true,
  };
  return normalizeBboxObject(bbox);
}

function normalizeBboxObject(value: unknown) {
  const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const x = clampUnit(Number(source.x ?? 0));
  const y = clampUnit(Number(source.y ?? 0));
  const width = Math.max(0.02, Math.min(1 - x, Number(source.width ?? 1)));
  const height = Math.max(0.02, Math.min(1 - y, Number(source.height ?? 1)));
  return {
    page: Math.max(1, Math.floor(Number(source.page ?? 1) || 1)),
    x,
    y,
    width: clampUnit(width),
    height: clampUnit(height),
    normalized: true,
  };
}

function mergeBboxes(first: ReturnType<typeof normalizeBboxObject>, second: ReturnType<typeof normalizeBboxObject>) {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);
  return normalizeBboxObject({ page: first.page, x, y, width: right - x, height: bottom - y, normalized: true });
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
