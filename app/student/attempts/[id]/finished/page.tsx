import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { QuestionPaper } from "@/components/question-paper";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { getStudentAttemptResultsWorkspace } from "@/lib/live-data";
import type { FeedbackRelease } from "@/types/database";

export default async function FinishedReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { package: assessmentPackage, assetUrls } = await getAttemptScreenData(id, true);
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
        description={`Attempt ${id} is finished. Uploads and editing are disabled; content is readonly for review.`}
      />
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-4 border-[#e7a09a] bg-[var(--danger-bg)] shadow-none">
        <AttemptStateBadge state="FINISHED_REVIEW" />
        <p className="text-sm text-[var(--danger)]">Submission summary: 1 typed response, 1 blank placeholder.</p>
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
            <a 
              href={`/student/attempts/${id}/results`}
              className="rounded-lg bg-[#123d18] px-4 py-2 text-sm font-bold text-white transition-all hover:bg-[#1a5522] hover:shadow-lg active:scale-95"
            >
              View Full Results
            </a>
          </div>
        </Card>
      ) : null}
      {assessmentPackage ? <QuestionPaper questions={assessmentPackage.questions} assetUrls={assetUrls} readonly /> : null}
    </div>
  );
}
