import Link from "next/link";
import { redirect } from "next/navigation";
import { getAssessmentWorkspace, listOwnerAssessments } from "@/lib/live-data";
import { extractQuestionBankDrafts } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { AssessmentStatusBadge } from "@/components/ui/status-badge";

async function extractToQuestionBank(formData: FormData) {
  "use server";
  const assessmentId = String(formData.get("assessment_id") ?? "");
  if (!assessmentId) return;
  const workspace = await getAssessmentWorkspace(assessmentId);
  if (!workspace?.assessment || !workspace.latestVersion) return;
  const supabase = await createSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("app_role", "owner").single();
  if (profileError) throw profileError;
  const drafts = extractQuestionBankDrafts({
    assessment: workspace.assessment,
    version: workspace.latestVersion,
    questionNodes: workspace.questionNodes,
  });
  for (const draft of drafts) {
    const nodeKeyById = new Map([[draft.root.id, draft.root.node_key], ...draft.children.map((child) => [child.id, child.node_key] as const)]);
    const { data: item, error: itemError } = await supabase
      .from("question_bank_items")
      .insert({
        owner_profile_id: profile.id,
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
        marks_available: draft.marksAvailable,
        assessment_kind: workspace.assessment.assessment_kind,
        subject: workspace.assessment.subject,
        paper_code: workspace.assessment.paper_code,
        has_visual_assets: draft.hasVisualAssets,
        visual_asset_refs: draft.visualAssetRefs,
        answer_mode: "upload_pdf",
        markscheme_html: draft.markschemeHtml,
      })
      .select("*")
      .single();
    if (itemError) throw itemError;
    const children = draft.children.map((child) => {
      const parentId = child.parent_node_id ?? child.inferred_parent_id;
      return {
        question_bank_item_id: item.id,
        node_key: child.node_key,
        parent_node_key: parentId ? nodeKeyById.get(parentId) ?? null : null,
        ordinal_path: child.ordinal_path_resolved,
        prompt_html: child.prompt_html,
        prompt_latex: child.prompt_latex,
        marks_available: child.marks,
        markscheme_html: child.markscheme_html,
      };
    });
    if (children.length) {
      const { error: childError } = await supabase.from("question_bank_children").insert(children);
      if (childError) throw childError;
    }
  }
  redirect("/owner/question-bank");
}

export default async function ImportQuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment_id?: string }>;
}) {
  const { assessment_id: assessmentId } = await searchParams;
  const assessments = await listOwnerAssessments();
  const workspace = assessmentId ? await getAssessmentWorkspace(assessmentId) : null;
  const drafts =
    workspace?.assessment && workspace.latestVersion
      ? extractQuestionBankDrafts({
          assessment: workspace.assessment,
          version: workspace.latestVersion,
          questionNodes: workspace.questionNodes,
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
