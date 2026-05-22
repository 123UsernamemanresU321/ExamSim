import { ArrowLeft, ImageIcon } from "lucide-react";
import { revalidatePath } from "next/cache";
import { getQuestionBankItemWorkspace } from "@/lib/usability-data";
import { buildQuestionBankChildTree, calculateQuestionBankRootMarks, type QuestionBankTreeNode } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { splitTags } from "@/lib/subjects";
import { QuestionBankSourcePreview } from "@/components/owner/question-bank-source-preview";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { MathRenderer } from "@/components/math-renderer";

async function updateQuestionBankMetadata(formData: FormData) {
  "use server";
  const questionId = String(formData.get("question_id") ?? "");
  const tags = splitTags(formData.get("tags"));
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const estimatedDifficultyRaw = Number(formData.get("estimated_difficulty") ?? 0);
  const { error } = await (await createSupabaseServerClient())
    .from("question_bank_items")
    .update({
      subject,
      tags,
      estimated_difficulty: estimatedDifficultyRaw || null,
      do_not_reuse: formData.get("do_not_reuse") === "on",
    })
    .eq("id", questionId);
  if (error) throw error;
  revalidatePath(`/owner/question-bank/${questionId}`);
  revalidatePath("/owner/question-bank");
}

export default async function QuestionBankItemPage({ params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  const { item, children } = await getQuestionBankItemWorkspace(questionId);

  if (!item) {
    return (
      <main className="p-8">
        <Card className="p-8">
          <h1 className="text-xl font-black text-[var(--ink)]">Question bank item not found</h1>
          <ButtonLink className="mt-4" href="/owner/question-bank">Back to question bank</ButtonLink>
        </Card>
      </main>
    );
  }
  const tree = buildQuestionBankChildTree(children);
  const rootMarks = calculateQuestionBankRootMarks(item, tree);

  return (
    <main className="space-y-6 p-8">
      <ButtonLink href="/owner/question-bank" variant="ghost">
        <ArrowLeft size={16} /> Question bank
      </ButtonLink>
      <Card className="p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">{item.root_node_key}</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--ink)]">{item.title ?? `Question ${item.root_node_key}`}</h1>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[var(--muted)]">
          <span>{item.paper_code ?? "No paper code"}</span>
          <span>{item.subject ?? "No subject"}</span>
          <span>
            {rootMarks.value ?? "?"} marks{rootMarks.source === "computed" ? " inferred from child parts" : ""}
          </span>
          <span>{children.length} child part{children.length === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[var(--border)] bg-white px-2 py-1 text-xs font-bold text-[var(--muted)]">
              {tag}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <h2 className="mb-4 font-black text-[var(--ink)]">Question preview</h2>
          <div className="prose max-w-none">
            <MathRenderer html={item.prompt_html ?? undefined} latex={item.prompt_html ? undefined : item.prompt_latex ?? undefined} />
          </div>
          {tree.length ? (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-[var(--subtle)]">Question tree</h3>
              {tree.map((child) => (
                <QuestionBankTreeItem key={child.id} node={child} depth={1} />
              ))}
            </div>
          ) : null}
        </Card>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="font-black text-[var(--ink)]">Metadata and tags</h2>
            <form action={updateQuestionBankMetadata} className="mt-4 space-y-3">
              <input type="hidden" name="question_id" value={item.id} />
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Subject</span>
                <input name="subject" defaultValue={item.subject ?? ""} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" placeholder="Physics, Maths AA HL, Olympiad..." />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Tags</span>
                <input name="tags" defaultValue={item.tags.join(", ")} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" placeholder="mechanics, vectors, proof" />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Difficulty 1-5</span>
                <input name="estimated_difficulty" type="number" min="1" max="5" defaultValue={item.estimated_difficulty ?? ""} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" />
              </label>
              <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
                <input name="do_not_reuse" type="checkbox" defaultChecked={item.do_not_reuse} className="mt-1" />
                Do not reuse in generated papers
              </label>
              <Button type="submit" className="w-full text-white">Save metadata</Button>
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="font-black text-[var(--ink)]">Source context</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Source pages: {item.source_page_start ?? "?"}
              {item.source_page_end && item.source_page_end !== item.source_page_start ? `-${item.source_page_end}` : ""}
            </p>
            {item.has_visual_assets ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                <ImageIcon size={15} />
                This item depends on a diagram, graph, table, or figure.
              </div>
            ) : null}
            <div className="mt-4">
              <QuestionBankSourcePreview objectPath={item.source_pdf_object_path} pageStart={item.source_page_start} pageEnd={item.source_page_end} />
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-black text-[var(--ink)]">Markscheme</h2>
            {item.markscheme_html ? (
              <div className="mt-3 prose prose-sm max-w-none">
                <MathRenderer html={item.markscheme_html} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">No markscheme is attached to this question bank item.</p>
            )}
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
          <p className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">{node.node_key}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            {node.mark_source === "computed" ? "Computed parent total" : node.mark_source === "direct" ? "Direct mark allocation" : "Marks missing"}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--muted)]">
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
