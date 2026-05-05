import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { QuestionPaper } from "@/components/question-paper";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";

export default async function FinishedReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { package: assessmentPackage } = await getAttemptScreenData(id, true);
  return (
    <div className="mx-auto max-w-[980px]">
      <SectionHeading
        title="Time is up"
        description={`Attempt ${id} is finished. Uploads and editing are disabled; content is readonly for review.`}
      />
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-4 border-[#e7a09a] bg-[var(--danger-bg)] shadow-none">
        <AttemptStateBadge state="FINISHED_REVIEW" />
        <p className="text-sm text-[var(--danger)]">Submission summary: 1 typed response, 1 blank placeholder.</p>
      </Card>
      {assessmentPackage ? <QuestionPaper questions={assessmentPackage.questions} readonly /> : null}
    </div>
  );
}
