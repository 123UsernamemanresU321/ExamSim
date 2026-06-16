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
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("question_source_regions").insert({
    assessment_version_id: versionId,
    source_document_id: sourceDocumentId,
    question_node_id: String(formData.get("question_node_id") || "") || null,
    node_key: String(formData.get("node_key") || "") || null,
    region_type: String(formData.get("region_type") || "question") as "question",
    status: "needs_review",
    confidence: 0.5,
    bbox_json: {
      page: Number(formData.get("page_number") ?? 1),
      x: Number(formData.get("x") ?? 0),
      y: Number(formData.get("y") ?? 0),
      width: Number(formData.get("width") ?? 1),
      height: Number(formData.get("height") ?? 1),
      normalized: true,
    },
  });
  if (error) throw error;
  revalidatePath(`/owner/assessments/${assessmentId}/compiler`);
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
