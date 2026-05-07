import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { CountdownTimer } from "@/components/countdown-timer";
import { QuestionNavigator } from "@/components/question-navigator";
import { QuestionPaper } from "@/components/question-paper";
import { TelemetryListener } from "@/components/telemetry-listener";
import { UploadSlotCard } from "@/components/upload-slot-card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { flattenQuestionNodes } from "@/lib/assessment-package";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { demoAttemptParams } from "@/lib/static-params";

export function generateStaticParams() {
  return demoAttemptParams();
}

export default async function ActiveExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const screenData = await getAttemptScreenData(id, true).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "Attempt could not be loaded.",
  }));
  if ("error" in screenData) {
    return (
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-lg border border-[var(--border)] bg-white p-6">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Attempt could not be opened</h1>
        <p className="text-sm leading-6 text-[var(--muted)]">
          {screenData.error} Open the student dashboard and choose one of your assigned attempts.
        </p>
        <ButtonLink href="/student">Back to assigned attempts</ButtonLink>
      </section>
    );
  }
  const { attempt, package: assessmentPackage, packageError, stateToken } = screenData;
  if (!assessmentPackage) {
    return (
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-lg border border-[var(--border)] bg-white p-6">
        <AttemptStateBadge state={attempt.state} />
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">Exam content is not available here yet</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {packageError ?? "The server has not released the exam package for this attempt state."}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Current server state: {attempt.state}. Use the attempt dashboard to open the correct waiting, writing,
            upload, or finished screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/student">Back to assigned attempts</ButtonLink>
          {attempt.state === "WAITING" ? <ButtonLink href={`/student/attempts/${id}/waiting`} variant="secondary">Open waiting room</ButtonLink> : null}
          {attempt.state === "UPLOAD_ONLY" ? <ButtonLink href={`/student/attempts/${id}/upload`} variant="secondary">Open upload page</ButtonLink> : null}
          {attempt.state === "FINISHED_REVIEW" ? <ButtonLink href={`/student/attempts/${id}/finished`} variant="secondary">Open finished review</ButtonLink> : null}
        </div>
      </section>
    );
  }
  const uploadNodes = flattenQuestionNodes(assessmentPackage.questions).filter((node) =>
    node.response_mode.includes("upload"),
  );
  return (
    <div className="exam-mode -mx-5 -my-8 px-5 py-8 md:-mx-8 md:px-8">
      <TelemetryListener attemptId={id} stateToken={stateToken} />
      <header className="sticky top-0 z-10 -mx-5 mb-8 border-b border-[var(--border)] bg-[rgba(246,249,255,0.96)] px-5 py-3 backdrop-blur md:-mx-8 md:px-8">
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
      <div className="mx-auto grid max-w-[1540px] gap-8 lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_320px]">
        <div className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
          <QuestionNavigator questions={assessmentPackage.questions} />
        </div>
        <QuestionPaper questions={assessmentPackage.questions} />
        <aside className="grid content-start gap-4 xl:sticky xl:top-28 xl:self-start" aria-label="Response tools">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Response panel</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Typed answers autosave during ACTIVE. Upload URLs are issued one slot at a time.
            </p>
            <Button className="mt-4 w-full" type="button" variant="secondary">
              Flag current question
            </Button>
          </section>
          <div className="lg:hidden">
            <QuestionNavigator questions={assessmentPackage.questions} />
          </div>
          {uploadNodes.map((node) => (
            <UploadSlotCard
              key={node.node_id}
              attemptId={id}
              questionNodeId={node.node_id}
              questionKey={node.node_key}
              stateToken={stateToken}
              status="pending"
            />
          ))}
          <section className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-6 text-[var(--muted)] shadow-sm">
            Browser telemetry is moderation evidence only. It does not prove cheating.
          </section>
        </aside>
      </div>
    </div>
  );
}
