import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { CountdownTimer } from "@/components/countdown-timer";
import { QuestionNavigator } from "@/components/question-navigator";
import { QuestionPaper } from "@/components/question-paper";
import { TelemetryListener } from "@/components/telemetry-listener";
import { UploadSlotCard } from "@/components/upload-slot-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { flattenQuestionNodes } from "@/lib/assessment-package";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";

export default async function ActiveExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { attempt, package: assessmentPackage, stateToken } = await getAttemptScreenData(id, true);
  if (!assessmentPackage) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-white p-6">
        Content is not available for this attempt state. Return to the waiting room and refresh server state.
      </section>
    );
  }
  const uploadNodes = flattenQuestionNodes(assessmentPackage.questions).filter((node) =>
    node.response_mode.includes("upload"),
  );
  return (
    <>
      <TelemetryListener attemptId={id} stateToken={stateToken} />
      <header className="sticky top-0 z-10 -mx-5 mb-5 border-b border-[var(--border)] bg-[rgba(246,249,255,0.96)] px-5 py-3 backdrop-blur md:-mx-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AttemptStateBadge state="ACTIVE" />
            <div>
              <h1 className="font-semibold">{assessmentPackage.assessment.title}</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">
                {assessmentPackage.assessment.paper_code} · Browser Mode
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="success">Saved 08:14:42 UTC</Badge>
            <CountdownTimer
              serverNowUtc={attempt.server_now_utc}
              targetUtc={attempt.countdown_target_utc}
              state="ACTIVE"
            />
          </div>
        </div>
      </header>
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(620px,840px)_380px] xl:justify-center">
        <div className="xl:sticky xl:top-24 xl:self-start">
          <QuestionNavigator questions={assessmentPackage.questions} />
        </div>
        <QuestionPaper questions={assessmentPackage.questions} />
        <aside className="grid gap-4 xl:sticky xl:top-24 xl:self-start" aria-label="Response tools">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Response panel</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Typed answers autosave during ACTIVE. Upload URLs are issued one slot at a time by a server function.
            </p>
            <Button className="mt-4 w-full" type="button" variant="secondary">
              Flag current question
            </Button>
          </section>
          {uploadNodes.map((node) => (
            <UploadSlotCard key={node.node_id} questionKey={node.node_key} status="pending" />
          ))}
          <section className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-6 text-[var(--muted)]">
            Browser telemetry is moderation evidence only. It does not prove cheating and does not replace owner review.
          </section>
        </aside>
      </div>
    </>
  );
}
