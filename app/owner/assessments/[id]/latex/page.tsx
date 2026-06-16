import { createLatexDraftAction } from "@/app/owner/assessments/[id]/authoring/actions";
import { LatexImportWorkspace } from "@/components/owner/latex-import-workspace";
import { SectionHeading } from "@/components/section-heading";

export default async function LatexImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SectionHeading
        title="LaTeX Import"
        description="Use Examsim syntax to split questions, answers, marks, topics, and markschemes while preserving equations. File-backed uploads continue through ingest-assessment; inline drafts stay review-required."
      />
      <LatexImportWorkspace createDraftAction={createLatexDraftAction.bind(null, id)} />
    </>
  );
}
