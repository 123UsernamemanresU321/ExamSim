import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { CountdownTimer } from "@/components/countdown-timer";
import { QuestionPaper } from "@/components/question-paper";
import { SectionHeading } from "@/components/section-heading";
import { UploadSlotCard } from "@/components/upload-slot-card";
import { attemptWithState, samplePackage } from "@/lib/demo-data";

export default async function UploadOnlyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attempt = attemptWithState(id);
  return (
    <>
      <SectionHeading
        title="Upload only"
        description="Writing time has ended. Typed writing is disabled; upload slots remain available until the server deadline."
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#d7b85f] bg-[var(--warning-bg)] p-4">
        <AttemptStateBadge state="UPLOAD_ONLY" />
        <CountdownTimer
          serverNowUtc={attempt.server_now_utc}
          targetUtc={attempt.countdown_target_utc}
          state="UPLOAD_ONLY"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(620px,840px)_380px] xl:justify-center">
        <QuestionPaper questions={samplePackage.questions} readonly />
        <aside className="grid content-start gap-3 xl:sticky xl:top-24" aria-label="Upload slots">
          <div className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-6 text-[var(--muted)]">
            One PDF per question or subquestion. Blank placeholders are recorded as moderation-visible submission
            choices, not hidden failures.
          </div>
          <UploadSlotCard questionKey="1" status="pending" />
          <UploadSlotCard questionKey="1(b)" status="blank_placeholder" />
        </aside>
      </div>
    </>
  );
}
