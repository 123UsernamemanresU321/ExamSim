import { MarkingWorkspaceForm } from "@/components/owner/marking-workspace-form";
import { QuestionPaper } from "@/components/question-paper";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { samplePackage, sampleReport } from "@/lib/demo-data";
import { getOwnerAttemptReviewWorkspace } from "@/lib/live-data";
import { demoAttemptParams } from "@/lib/static-params";

export function generateStaticParams() {
  return demoAttemptParams();
}

export default async function MarkAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getOwnerAttemptReviewWorkspace(id);
  const assessmentPackage = workspace.package ?? samplePackage;
  return (
    <>
      <SectionHeading
        title="Marking workspace"
        description={`Attempt ${id}. Save marks, annotations, exports, and explicit feedback release.`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(620px,840px)_380px] xl:justify-center">
        <QuestionPaper questions={assessmentPackage.questions} readonly />
        <aside className="grid content-start gap-4 xl:sticky xl:top-24">
          <Card className="shadow-none">
            <h2 className="text-lg font-semibold">Submission summary</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {workspace.textResponses.length} typed response(s). {workspace.uploadSlots.length} upload slot(s).
            </p>
          </Card>
          <Card className="shadow-none">
            <h2 className="text-lg font-semibold">Moderation</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{sampleReport.language}</p>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Marks and feedback</h2>
            <MarkingWorkspaceForm
              attemptId={id}
              questionNodes={workspace.questionNodes}
              textResponses={workspace.textResponses}
              uploadSlots={workspace.uploadSlots}
              marks={workspace.marks}
              annotations={workspace.annotations}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}
