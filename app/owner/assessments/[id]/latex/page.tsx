import { createLatexDraftAction } from "@/app/owner/assessments/[id]/authoring/actions";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function LatexImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SectionHeading title="LaTeX Import" description="Use Examsim syntax to split questions, answers, marks, topics, and markschemes while preserving equations." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold text-[var(--ink)]">Editor</h2>
          <form action={createLatexDraftAction.bind(null, id)} className="mt-4 grid gap-3">
            <textarea
              name="latex_source"
              className="min-h-[420px] w-full rounded-[2px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 font-mono text-sm"
              defaultValue={"\\question[6][topic=modular arithmetic]\nProve that ...\n\n\\answerbox{proof}\n\n\\markscheme{\nM1: correct setup\nA1: conclusion\n}"}
            />
            <Button type="submit">Create review draft</Button>
          </form>
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-[var(--ink)]">Rendered preview</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            The deterministic LaTeX importer is wired through the existing assessment ingestion pipeline. File-backed imports use the
            <code className="mx-1 rounded bg-[var(--surface-muted)] px-1 py-0.5 font-mono text-xs">ingest-assessment</code>
            Edge Function; inline drafts are recorded as review-required parse jobs so teachers can validate syntax before creating or replacing the internal normalized package.
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-[var(--muted)]">
            <li>Supported markers: <code>\\question[marks][topic=...]</code></li>
            <li>Answer zones: <code>\\answerbox{"{proof}"}</code></li>
            <li>Markscheme blocks: <code>\\markscheme{"{...}"}</code></li>
          </ul>
        </Card>
      </div>
    </>
  );
}
