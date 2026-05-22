import { ArrowLeft, ImageIcon } from "lucide-react";
import { getQuestionBankItemWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { MathRenderer } from "@/components/math-renderer";

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
          <span>{item.marks_available ?? "?"} marks</span>
          <span>{children.length} child part{children.length === 1 ? "" : "s"}</span>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <h2 className="mb-4 font-black text-[var(--ink)]">Question preview</h2>
          <div className="prose max-w-none">
            <MathRenderer html={item.prompt_html ?? undefined} latex={item.prompt_html ? undefined : item.prompt_latex ?? undefined} />
          </div>
          {children.length ? (
            <div className="mt-6 space-y-3">
              {children.map((child) => (
                <div key={child.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">{child.node_key}</p>
                  <div className="mt-2 prose prose-sm max-w-none">
                    <MathRenderer html={child.prompt_html ?? undefined} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-[var(--muted)]">{child.marks_available ?? "?"} marks</p>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <aside className="space-y-4">
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
