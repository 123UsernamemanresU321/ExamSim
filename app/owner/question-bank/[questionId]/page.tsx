import { ArrowLeft, ImageIcon } from "lucide-react";
import { revalidatePath } from "next/cache";
import { getQuestionBankItemWorkspace } from "@/lib/usability-data";
import { buildQuestionBankChildTree, calculateQuestionBankRootMarks, type QuestionBankTreeNode } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { splitTags } from "@/lib/subjects";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { QuestionBankSourcePreview } from "@/components/owner/question-bank-source-preview";
import { DeleteQuestionBankItemButton } from "@/components/owner/delete-question-bank-item-button";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { MathRenderer } from "@/components/math-renderer";

async function updateQuestionBankMetadata(formData: FormData) {
  "use server";
  const { ownerProfileId } = await requireInstitutionPermission("assessment_authoring");
  const questionId = String(formData.get("question_id") ?? "");
  const tags = splitTags(formData.get("tags"));
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const estimatedDifficultyRaw = Number(formData.get("estimated_difficulty") ?? 0);
  const yearRaw = Number(formData.get("year") ?? 0);
  const requestedStandardIds = formData.getAll("standard_ids").map(String).filter(Boolean);
  const supabase = await createSupabaseServerClient();
  if (requestedStandardIds.length) {
    const { data: standards, error: standardError } = await supabase.from("curriculum_standards").select("id").eq("owner_profile_id", ownerProfileId).in("id", requestedStandardIds);
    if (standardError) throw standardError;
    if ((standards ?? []).length !== new Set(requestedStandardIds).size) throw new Error("One or more standards are outside this institution.");
  }
  const readinessValue = String(formData.get("readiness_status") ?? "needs_review");
  const { error } = await supabase
    .from("question_bank_items")
    .update({
      subject,
      tags,
      estimated_difficulty: estimatedDifficultyRaw || null,
      do_not_reuse: formData.get("do_not_reuse") === "on",
      subtopic: String(formData.get("subtopic") ?? "").trim() || null,
      year: yearRaw >= 1900 && yearRaw <= 2200 ? yearRaw : null,
      paper_type: String(formData.get("paper_type") ?? "").trim() || null,
      command_term: String(formData.get("command_term") ?? "").trim().toLowerCase() || null,
      curriculum_standard_ids: [...new Set(requestedStandardIds)],
      readiness_status: ["ready", "needs_review", "retired"].includes(readinessValue) ? readinessValue as "ready" | "needs_review" | "retired" : "needs_review",
    })
    .eq("id", questionId)
    .eq("owner_profile_id", ownerProfileId);
  if (error) throw error;
  revalidatePath(`/owner/question-bank/${questionId}`);
  revalidatePath("/owner/question-bank");
}

export default async function QuestionBankItemPage({ params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  const { item, children } = await getQuestionBankItemWorkspace(questionId);

  if (!item) {
    return (
      <main>
        <Card className="p-8">
          <h1 className="text-xl font-semibold text-[var(--ink)]">Question library item not found</h1>
          <ButtonLink className="mt-4" href="/owner/question-bank">Back to question library</ButtonLink>
        </Card>
      </main>
    );
  }
  const tree = buildQuestionBankChildTree(children);
  const rootMarks = calculateQuestionBankRootMarks(item, tree);
  const visualAssetRefs = Array.isArray(item.visual_asset_refs)
    ? item.visual_asset_refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)
    : [];
  const supabase = await createSupabaseServerClient();
  const { data: standards, error: standardError } = await supabase.from("curriculum_standards").select("id,code,title").order("code");
  if (standardError) throw standardError;

  return (
    <main className="space-y-6">
      <ButtonLink href="/owner/question-bank" variant="ghost">
        <ArrowLeft size={16} /> Question library
      </ButtonLink>
      <PageHeader
        eyebrow={item.root_node_key}
        title={item.title ?? `Question ${item.root_node_key}`}
        description={`${item.paper_code ?? "No paper code"} · ${item.subject ?? "No subject"} · ${rootMarks.value ?? "?"} marks${rootMarks.source === "computed" ? " inferred from child parts" : ""} · ${children.length} child part${children.length === 1 ? "" : "s"}`}
      />
      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          {item.tags.length ? item.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--muted)]">
              {tag}
            </span>
          )) : <span className="text-sm text-[var(--muted)]">No tags yet.</span>}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <SectionHeader title="Question preview" />
          <div className="prose max-w-none">
            <MathRenderer html={item.prompt_html ?? undefined} latex={item.prompt_html ? undefined : item.prompt_latex ?? undefined} />
          </div>
          {tree.length ? (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Question tree</h3>
              {tree.map((child) => (
                <QuestionBankTreeItem key={child.id} node={child} depth={1} />
              ))}
            </div>
          ) : null}
          {item.source_pdf_object_path ? (
            <div className="mt-8 space-y-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Original source pages and diagrams</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  This rendered source view is the fallback for diagrams, graphs, tables, and layout that OCR or AI extraction may omit.
                </p>
              </div>
              <QuestionBankSourcePreview objectPath={item.source_pdf_object_path} pageStart={item.source_page_start} pageEnd={item.source_page_end} />
            </div>
          ) : item.has_visual_assets ? (
            <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              This item is marked as visual, but no original source PDF path is attached. Re-extract it from an assessment version with a private PDF source.
            </div>
          ) : null}
        </Card>

        <aside className="space-y-4">
          <Card className="p-5">
            <SectionHeader title="Metadata and tags" />
            <form action={updateQuestionBankMetadata} className="mt-4 space-y-3">
              <input type="hidden" name="question_id" value={item.id} />
              <Field label="Subject">
                <Input name="subject" defaultValue={item.subject ?? ""} placeholder="Physics, Maths AA HL, Olympiad..." />
              </Field>
              <Field label="Tags">
                <Input name="tags" defaultValue={item.tags.join(", ")} placeholder="mechanics, vectors, proof" />
              </Field>
              <Field label="Difficulty 1-5">
                <Input name="estimated_difficulty" type="number" min="1" max="5" defaultValue={item.estimated_difficulty ?? ""} />
              </Field>
              <Field label="Subtopic"><Input name="subtopic" defaultValue={item.subtopic ?? ""} placeholder="linear equations" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Year"><Input name="year" type="number" min="1900" max="2200" defaultValue={item.year ?? ""} /></Field>
                <Field label="Paper type"><Input name="paper_type" defaultValue={item.paper_type ?? ""} placeholder="Paper 1" /></Field>
              </div>
              <Field label="Command term"><Input name="command_term" defaultValue={item.command_term ?? ""} placeholder="calculate" /></Field>
              <Field label="Standards" tooltip="Attach verified standards used by analytics and revision recommendations.">
                <Select name="standard_ids" multiple className="min-h-28" defaultValue={item.curriculum_standard_ids}>
                  {(standards ?? []).map((standard) => <option key={standard.id} value={standard.id}>{standard.code} · {standard.title}</option>)}
                </Select>
              </Field>
              <Field label="Library readiness"><Select name="readiness_status" defaultValue={item.readiness_status}><option value="needs_review">Needs review</option><option value="ready">Ready</option><option value="retired">Retired</option></Select></Field>
              <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
                <input name="do_not_reuse" type="checkbox" defaultChecked={item.do_not_reuse} className="mt-1" />
                Do not reuse in generated papers
              </label>
              <Button type="submit" className="w-full !text-white">Save metadata</Button>
            </form>
          </Card>
          <Card className="p-5">
            <SectionHeader title="Source context" />
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Source pages: {item.source_page_start ?? "?"}
              {item.source_page_end && item.source_page_end !== item.source_page_start ? `-${item.source_page_end}` : ""}
            </p>
            <p className="mt-2 text-xs font-mono text-[var(--muted)]">Fingerprint: {item.content_fingerprint ?? "not generated"}</p>
            {item.has_visual_assets ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                <ImageIcon size={15} />
                This item depends on a diagram, graph, table, or figure.
              </div>
            ) : null}
            {visualAssetRefs.length ? (
              <div className="mt-3 rounded-lg border border-[var(--border)] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Visual references</p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                  {visualAssetRefs.slice(0, 6).map((ref) => (
                    <li key={ref}>{ref}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
          <Card className="p-5">
            <SectionHeader title="Markscheme" />
            {item.markscheme_html ? (
              <div className="mt-3 prose prose-sm max-w-none">
                <MathRenderer html={item.markscheme_html} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">No markscheme is attached to this question library item.</p>
            )}
          </Card>
          <Card className="border-[var(--danger)]/30 bg-[var(--danger-bg)]/30 p-5">
            <h2 className="font-semibold text-[var(--danger)]">Delete from question library</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Removes this reusable question and its child tree from the question library. It does not delete the original assessment, source PDF, markscheme, or published paper.
            </p>
            <div className="mt-4">
              <DeleteQuestionBankItemButton questionBankItemId={item.id} label={item.title ?? `Question ${item.root_node_key}`} />
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}

function QuestionBankTreeItem({ node, depth }: { node: QuestionBankTreeNode; depth: number }) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4" style={{ marginLeft: `${Math.max(0, depth - 1) * 18}px` }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">{node.node_key}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            {node.mark_source === "computed" ? "Computed parent total" : node.mark_source === "direct" ? "Direct mark allocation" : "Marks missing"}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          {node.computed_marks_available ?? "?"} marks{node.mark_source === "computed" ? " inferred" : ""}
        </span>
      </div>
      <div className="mt-3 prose prose-sm max-w-none">
        <MathRenderer html={node.prompt_html ?? undefined} latex={node.prompt_html ? undefined : node.prompt_latex ?? undefined} />
      </div>
      {node.children.length ? (
        <div className="mt-4 space-y-3">
          {node.children.map((child) => (
            <QuestionBankTreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
