import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { samplePackage } from "@/lib/demo-data";

export default async function ParseReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SectionHeading
        title="Parse review"
        description={`Assessment ${id}. Owner confirms the question/subquestion tree before publish.`}
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
          {samplePackage.questions.map((node) => (
            <div key={node.node_id} className="rounded-md border border-[var(--border)] bg-white p-4">
              <p className="text-sm font-semibold">
                {node.node_key} · {node.node_type} · {node.response_mode}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">{node.title}</p>
              {node.children?.map((child) => (
                <p key={child.node_id} className="mt-2 pl-4 text-sm text-[var(--muted)]">
                  {child.node_key} · {child.response_mode} · {child.marks ?? 0} marks
                </p>
              ))}
            </div>
          ))}
          <Button className="justify-self-start" type="button">Save reviewed tree</Button>
        </Card>
      </div>
    </>
  );
}
