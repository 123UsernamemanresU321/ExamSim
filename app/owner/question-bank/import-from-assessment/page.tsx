import Link from "next/link";
import { redirect } from "next/navigation";
import { getAssessmentWorkspace, listOwnerAssessments } from "@/lib/live-data";
import { contentFingerprintForQuestion, extractQuestionBankDrafts } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { AssessmentStatusBadge } from "@/components/ui/status-badge";

async function extractToQuestionBank(formData: FormData) {
  "use server";
  const { ownerProfileId } = await requireInstitutionPermission("assessment_authoring");
  const assessmentId = String(formData.get("assessment_id") ?? "");
  if (!assessmentId) return;
  const workspace = await getAssessmentWorkspace(assessmentId);
  if (!workspace?.assessment || !workspace.latestVersion) return;
  const supabase = await createSupabaseServerClient();
  if (workspace.assessment.owner_profile_id !== ownerProfileId) throw new Error("Assessment is outside this institution workspace.");
  const context = await loadExtractionContext(supabase, workspace.latestVersion.id, workspace.questionNodes.map((node) => node.id));
  const drafts = extractQuestionBankDrafts({
    assessment: workspace.assessment,
    version: workspace.latestVersion,
    questionNodes: workspace.questionNodes,
    sourceRegions: context.sourceRegions,
  });
  let insertedCount = 0;
  let duplicateCount = 0;
  for (const draft of drafts) {
    const nodeKeyById = new Map([[draft.root.id, draft.root.node_key], ...draft.children.map((child) => [child.id, child.node_key] as const)]);
    const sourceNodeIds = [draft.root.id, ...draft.children.map((child) => child.id)];
    const topicTagIds = [...new Set(context.topicLinks.filter((link) => sourceNodeIds.includes(link.question_node_id)).map((link) => link.topic_tag_id))];
    const curriculumStandardIds = [...new Set(context.standardLinks.filter((link) => sourceNodeIds.includes(link.question_node_id)).map((link) => link.curriculum_standard_id))];
    const rubricSnapshot = context.rubricCriteria.filter((criterion) => criterion.question_node_id && sourceNodeIds.includes(criterion.question_node_id));
    const contentFingerprint = contentFingerprintForQuestion({
      promptHtml: draft.root.prompt_html,
      promptLatex: draft.root.prompt_latex,
      marks: draft.marksAvailable,
      answerMode: draft.answerMode,
    });
    const { data: duplicate, error: duplicateError } = await supabase
      .from("question_bank_items")
      .select("id")
      .eq("owner_profile_id", ownerProfileId)
      .eq("content_fingerprint", contentFingerprint)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) {
      duplicateCount += 1;
      continue;
    }
    const { data: item, error: itemError } = await supabase
      .from("question_bank_items")
      .insert({
        owner_profile_id: ownerProfileId,
        source_assessment_id: workspace.assessment.id,
        source_assessment_version_id: workspace.latestVersion.id,
        source_question_node_id: draft.root.id.startsWith("synthetic:") ? null : draft.root.id,
        title: draft.title,
        root_node_key: draft.rootNodeKey,
        prompt_html: draft.root.prompt_html,
        prompt_latex: draft.root.prompt_latex,
        source_pdf_object_path: draft.sourceObjectPath,
        source_page_start: draft.sourcePageStart,
        source_page_end: draft.sourcePageEnd,
        source_region_json: draft.sourceRegionJson,
        marks_available: draft.marksAvailable,
        assessment_kind: workspace.assessment.assessment_kind,
        subject: workspace.assessment.subject,
        paper_code: workspace.assessment.paper_code,
        has_visual_assets: draft.hasVisualAssets,
        visual_asset_refs: draft.visualAssetRefs,
        answer_mode: draft.answerMode,
        interaction_json: draft.interactionJson,
        markscheme_html: draft.markschemeHtml,
        topic_tag_ids: topicTagIds,
        curriculum_standard_ids: curriculumStandardIds,
        content_fingerprint: contentFingerprint,
        readiness_status: draft.marksAvailable != null ? "ready" : "needs_review",
        source_history_json: [{
          assessment_id: workspace.assessment.id,
          assessment_version_id: workspace.latestVersion.id,
          question_node_id: draft.root.id,
          extracted_at: new Date().toISOString(),
        }],
        rubric_json: rubricSnapshot,
      })
      .select("*")
      .single();
    if (itemError) throw itemError;
    const children = draft.children.map((child) => {
      const parentId = child.parent_node_id ?? child.inferred_parent_id;
      return {
        question_bank_item_id: item.id,
        source_question_node_id: child.id.startsWith("synthetic:") ? null : child.id,
        node_key: child.node_key,
        parent_node_key: parentId ? nodeKeyById.get(parentId) ?? null : null,
        ordinal_path: child.ordinal_path_resolved,
        prompt_html: child.prompt_html,
        prompt_latex: child.prompt_latex,
        marks_available: child.marks,
        markscheme_html: child.markscheme_html,
        response_mode: child.response_mode,
        interaction_json: child.interaction_json,
        source_region_json: context.sourceRegions.filter((region) => region.question_node_id === child.id),
        visual_asset_refs: [...(child.visual_asset_refs ?? []), ...(child.assets ?? [])],
      };
    });
    if (children.length) {
      const { error: childError } = await supabase.from("question_bank_children").insert(children);
      if (childError) throw childError;
    }
    insertedCount += 1;
  }
  redirect(`/owner/question-bank?imported=${insertedCount}&duplicates=${duplicateCount}`);
}

export default async function ImportQuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment_id?: string }>;
}) {
  const { assessment_id: assessmentId } = await searchParams;
  const assessments = await listOwnerAssessments();
  const workspace = assessmentId ? await getAssessmentWorkspace(assessmentId) : null;
  const supabase = await createSupabaseServerClient();
  const context = workspace?.latestVersion
    ? await loadExtractionContext(supabase, workspace.latestVersion.id, workspace.questionNodes.map((node) => node.id))
    : { sourceRegions: [], topicLinks: [], standardLinks: [], rubricCriteria: [] };
  const drafts =
    workspace?.assessment && workspace.latestVersion
      ? extractQuestionBankDrafts({
          assessment: workspace.assessment,
          version: workspace.latestVersion,
          questionNodes: workspace.questionNodes,
          sourceRegions: context.sourceRegions,
        })
      : [];

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Import from assessment"
        title="Extract root questions"
        description="Extraction uses the repaired root-question tree. It preserves source page fallback and child structure; owner review remains required before reuse."
      />

      <Card className="p-6">
        <SectionHeader title="Choose an assessment" />
        <DataList>
          {assessments.map((assessment) => (
            <DataListRow key={assessment.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <Link href={`/owner/question-bank/import-from-assessment?assessment_id=${assessment.id}`} className="min-w-0">
                <p className="truncate font-semibold text-[var(--ink)]">{assessment.title}</p>
                <DataListMeta className="mt-1">
                  <span>{assessment.paper_code ?? "No paper code"}</span>
                  <AssessmentStatusBadge status={assessment.latest_status} />
                </DataListMeta>
              </Link>
              <Link href={`/owner/question-bank/import-from-assessment?assessment_id=${assessment.id}`} className="text-sm font-semibold text-[var(--primary)]">
                Select
              </Link>
            </DataListRow>
          ))}
        </DataList>
      </Card>

      {workspace ? (
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--ink)]">Extractable root questions</h2>
              <p className="text-sm text-[var(--muted)]">{drafts.length} root question drafts found.</p>
            </div>
            <form action={extractToQuestionBank}>
              <input type="hidden" name="assessment_id" value={workspace.assessment.id} />
              <Button type="submit">Extract all root questions</Button>
            </form>
          </div>
          {drafts.length ? (
            <DataList>
              {drafts.map((draft) => (
                <DataListRow key={draft.root.id}>
                  <p className="font-semibold text-[var(--ink)]">{draft.rootNodeKey} · {draft.title}</p>
                  <DataListMeta className="mt-1">
                    <span>
                    {draft.marksAvailable ?? "?"} marks · {draft.children.length} child parts · pages {draft.sourcePageStart ?? "?"}-{draft.sourcePageEnd ?? draft.sourcePageStart ?? "?"}
                    </span>
                  </DataListMeta>
                </DataListRow>
              ))}
            </DataList>
          ) : (
            <EmptyState title="No root questions found" description="Run parser repair and parse review before extracting question library items." />
          )}
        </Card>
      ) : null}
    </main>
  );
}

async function loadExtractionContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  versionId: string,
  questionIds: string[],
) {
  const [{ data: sourceRegions, error: regionError }, { data: topicLinks, error: topicError }, { data: standardLinks, error: standardError }, { data: rubrics, error: rubricError }] = await Promise.all([
    supabase.from("question_source_regions").select("*").eq("assessment_version_id", versionId),
    questionIds.length ? supabase.from("question_topic_links").select("question_node_id,topic_tag_id").in("question_node_id", questionIds) : { data: [], error: null },
    questionIds.length ? supabase.from("question_standard_links").select("question_node_id,curriculum_standard_id").in("question_node_id", questionIds) : { data: [], error: null },
    supabase.from("rubrics").select("id").eq("assessment_version_id", versionId),
  ]);
  if (regionError) throw regionError;
  if (topicError) throw topicError;
  if (standardError) throw standardError;
  if (rubricError) throw rubricError;
  const pageIds = [...new Set((sourceRegions ?? []).map((region) => region.source_page_id).filter((value): value is string => Boolean(value)))];
  const rubricIds = (rubrics ?? []).map((rubric) => rubric.id);
  const [{ data: sourcePages, error: pageError }, { data: rubricCriteria, error: criteriaError }] = await Promise.all([
    pageIds.length ? supabase.from("source_pages").select("id,page_number").in("id", pageIds) : { data: [], error: null },
    rubricIds.length ? supabase.from("rubric_criteria").select("question_node_id,ordinal,label,description,max_marks").in("rubric_id", rubricIds) : { data: [], error: null },
  ]);
  if (pageError) throw pageError;
  if (criteriaError) throw criteriaError;
  const pageNumberById = new Map((sourcePages ?? []).map((page) => [page.id, page.page_number]));
  return {
    sourceRegions: (sourceRegions ?? []).map((region) => ({ ...region, page_number: region.source_page_id ? pageNumberById.get(region.source_page_id) ?? null : null })),
    topicLinks: topicLinks ?? [],
    standardLinks: standardLinks ?? [],
    rubricCriteria: rubricCriteria ?? [],
  };
}
