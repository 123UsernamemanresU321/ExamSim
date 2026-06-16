import { isDemoModeEnabled } from "@/lib/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Assessment, AssessmentVersion, QuestionNodeRow, QuestionSourceRegion, RubricTemplate, RubricTemplateItem, SourceDocument, SourcePage } from "@/types/database";

export type AssessmentAuthoringWorkspace = {
  assessment: Assessment | null;
  latestVersion: AssessmentVersion | null;
  questionNodes: QuestionNodeRow[];
  sourceDocuments: SourceDocument[];
  sourcePages: SourcePage[];
  sourceRegions: QuestionSourceRegion[];
  rubricTemplates: RubricTemplate[];
  rubricTemplateItems: RubricTemplateItem[];
};

export async function getAssessmentAuthoringWorkspace(assessmentId: string): Promise<AssessmentAuthoringWorkspace> {
  if (isDemoModeEnabled()) {
    return { assessment: null, latestVersion: null, questionNodes: [], sourceDocuments: [], sourcePages: [], sourceRegions: [], rubricTemplates: [], rubricTemplateItems: [] };
  }
  const supabase = await createSupabaseServerClient();
  const [{ data: assessment, error: assessmentError }, { data: versions, error: versionError }] = await Promise.all([
    supabase.from("assessments").select("*").eq("id", assessmentId).maybeSingle(),
    supabase.from("assessment_versions").select("*").eq("assessment_id", assessmentId).order("version_no", { ascending: false }).limit(1),
  ]);
  if (assessmentError) throw assessmentError;
  if (versionError) throw versionError;
  const latestVersion = (versions?.[0] ?? null) as AssessmentVersion | null;
  if (!latestVersion) {
    return { assessment: assessment as Assessment | null, latestVersion: null, questionNodes: [], sourceDocuments: [], sourcePages: [], sourceRegions: [], rubricTemplates: [], rubricTemplateItems: [] };
  }

  const [{ data: nodes, error: nodeError }, { data: docs, error: docError }, { data: regions, error: regionError }, { data: templates, error: templateError }] = await Promise.all([
    supabase.from("question_nodes").select("*").eq("assessment_version_id", latestVersion.id).order("ordinal"),
    supabase.from("source_documents").select("*").eq("assessment_version_id", latestVersion.id).order("created_at", { ascending: false }),
    supabase.from("question_source_regions").select("*").eq("assessment_version_id", latestVersion.id).order("created_at", { ascending: false }),
    supabase.from("rubric_templates").select("*").order("name", { ascending: true }),
  ]);
  if (nodeError) throw nodeError;
  if (docError) throw docError;
  if (regionError) throw regionError;
  if (templateError) throw templateError;
  const docIds = (docs ?? []).map((doc) => doc.id);
  const { data: pages, error: pageError } = docIds.length
    ? await supabase.from("source_pages").select("*").in("source_document_id", docIds).order("page_number")
    : { data: [], error: null };
  if (pageError) throw pageError;
  const templateIds = (templates ?? []).map((template) => template.id);
  const { data: templateItems, error: templateItemError } = templateIds.length
    ? await supabase.from("rubric_template_items").select("*").in("rubric_template_id", templateIds).order("ordinal", { ascending: true })
    : { data: [], error: null };
  if (templateItemError) throw templateItemError;

  return {
    assessment: assessment as Assessment | null,
    latestVersion,
    questionNodes: (nodes ?? []) as QuestionNodeRow[],
    sourceDocuments: (docs ?? []) as SourceDocument[],
    sourcePages: (pages ?? []) as SourcePage[],
    sourceRegions: (regions ?? []) as QuestionSourceRegion[],
    rubricTemplates: (templates ?? []) as RubricTemplate[],
    rubricTemplateItems: (templateItems ?? []) as RubricTemplateItem[],
  };
}
