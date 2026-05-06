import { ReviewQuestionTreeForm } from "@/components/owner/review-question-tree-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { getAssessmentWorkspace } from "@/lib/live-data";
import { demoAssessmentParams } from "@/lib/static-params";

export function generateStaticParams() {
  return demoAssessmentParams();
}

export default async function ParseReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAssessmentWorkspace(id);
  if (!workspace?.latestVersion) {
    return (
      <SectionHeading
        title="Parse review"
        description="Assessment or draft version was not found."
      />
    );
  }
  return (
    <>
      <SectionHeading
        title="Parse review"
        description={`${workspace.assessment.title}. Owner confirms the question/subquestion tree before publish.`}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(520px,1fr)_460px]">
        <Card className="paper-sheet min-h-[680px]">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--subtle)]">Source preview</p>
          <div className="paper-body space-y-4 text-base leading-7 text-[var(--muted)]">
            <p>Original PDF/LaTeX preview is private and rendered here for owner review.</p>
            <p>PDF parsing is a review-required MVP stub. JSON and LaTeX receive deterministic package extraction.</p>
          </div>
        </Card>
        <Card className="grid content-start gap-4 shadow-none">
          <h2 className="text-lg font-semibold">Detected tree</h2>
          {workspace.questionNodes.map((node) => (
            <div key={node.id} className="rounded-md border border-[var(--border)] bg-white p-4">
              <p className="text-sm font-semibold">
                {node.node_key} · {node.node_type} · {node.response_mode}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">{node.title}</p>
            </div>
          ))}
          <ReviewQuestionTreeForm versionId={workspace.latestVersion.id} nodes={workspace.questionNodes} />
        </Card>
      </div>
    </>
  );
}
