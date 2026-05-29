import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { QuestionPaper } from "@/components/question-paper";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { getStudentAttemptResultsWorkspace } from "@/lib/live-data";
import type { FeedbackRelease } from "@/types/database";

export default async function FinishedReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { package: assessmentPackage, assetUrls, responses, annotations, stateToken, uploadSlots } = await getAttemptScreenData(id, true);
  let feedback: FeedbackRelease | null = null;
  try {
    const results = await getStudentAttemptResultsWorkspace(id);
    feedback = results.feedbackRelease;
  } catch {
    feedback = null;
  }
  return (
    <div className="mx-auto max-w-[980px]">
      <SectionHeading
        title="Time is up"
        description={`Attempt ${id} is finished. Submissions are closed; content is readonly for review.`}
      />
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-4 border-[#e7a09a] bg-[var(--danger-bg)] shadow-none">
        <AttemptStateBadge state="FINISHED_REVIEW" />
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--danger)]">Uploads and editing are disabled. Keep your submission receipt for proof.</p>
          <ButtonLink href={`/student/attempts/${id}/receipt`} variant="secondary">
            Submission receipt
          </ButtonLink>
        </div>
      </Card>
      {feedback ? (
        <Card className="mb-5 border-[#78a86d] bg-[var(--success-bg)] shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#123d18]">Released feedback</h2>
              <p className="mt-2 text-sm leading-6 text-[#123d18]">{feedback.summary_text ?? "Feedback has been released."}</p>
              <p className="mt-2 text-sm font-semibold text-[#123d18]">
                {feedback.total_awarded_marks}/{feedback.total_available_marks} marks
              </p>
            </div>
            <ButtonLink href={`/student/attempts/${id}/results`} className="bg-[#123d18] hover:bg-[#1a5522]">
              View full results
            </ButtonLink>
          </div>
        </Card>
      ) : null}
      {assessmentPackage ? (
        <QuestionPaper
          questions={assessmentPackage.questions}
          attemptId={id}
          stateToken={stateToken}
          assetUrls={assetUrls}
          responses={responses}
          annotations={annotations}
          uploadSlots={uploadSlots}
          readonly
        />
      ) : null}
    </div>
  );
}
