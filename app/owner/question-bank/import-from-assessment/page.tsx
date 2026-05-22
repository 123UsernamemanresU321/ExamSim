import Link from "next/link";
import { redirect } from "next/navigation";
import { getAssessmentWorkspace, listOwnerAssessments } from "@/lib/live-data";
import { extractQuestionBankDrafts } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
    <main className="space-y-6 p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">Import From Assessment</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--ink)]">Extract root questions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Extraction uses the repaired root-question tree. It preserves source page fallback and child structure; owner review remains required before reuse.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 font-black text-[var(--ink)]">Choose an assessment</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {assessments.map((assessment) => (
            <Link key={assessment.id} href={`/owner/question-bank/import-from-assessment?assessment_id=${assessment.id}`}>
              <div className="rounded-lg border border-[var(--border)] bg-white p-4 hover:border-[var(--primary)]">
                <p className="font-black text-[var(--ink)]">{assessment.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{assessment.paper_code ?? "No paper code"} · {assessment.latest_status ?? "no version"}</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {workspace ? (
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-[var(--ink)]">Extractable root questions</h2>
              <p className="text-sm text-[var(--muted)]">{drafts.length} root question drafts found.</p>
            </div>
            <form action={extractToQuestionBank}>
              <input type="hidden" name="assessment_id" value={workspace.assessment.id} />
              <Button type="submit">Extract all root questions</Button>
            </form>
          </div>
          {drafts.length ? (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div key={draft.root.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <p className="font-black text-[var(--ink)]">{draft.rootNodeKey} · {draft.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {draft.marksAvailable ?? "?"} marks · {draft.children.length} child parts · pages {draft.sourcePageStart ?? "?"}-{draft.sourcePageEnd ?? draft.sourcePageStart ?? "?"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">
              No root questions were found. Run parser repair and parse review first.
            </div>
          )}
        </Card>
      ) : null}
    </main>
  );
}
