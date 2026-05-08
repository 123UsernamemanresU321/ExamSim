import { redirect } from "next/navigation";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { CountdownTimer } from "@/components/countdown-timer";
import { QuestionNavigator } from "@/components/question-navigator";
import { QuestionPaper } from "@/components/question-paper";
import { TelemetryListener } from "@/components/telemetry-listener";
import { UploadSlotCard } from "@/components/upload-slot-card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitExamButton } from "@/components/submit-exam-button";
import { flattenQuestionNodes } from "@/lib/assessment-package";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { demoAttemptParams } from "@/lib/static-params";

export function generateStaticParams() {
  return demoAttemptParams();
}

function LastSavedBadge({ responses }: { responses: { saved_at: string }[] }) {
  if (responses.length === 0) return <Badge tone="neutral">Not saved yet</Badge>;
  const latest = [...responses].sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at))[0];
  const time = new Date(latest.saved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return <Badge tone="success">Last saved {time} UTC</Badge>;
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

  const { attempt, package: assessmentPackage, packageError, stateToken, responses } = screenData;

  if (attempt.state === "WAITING") redirect(`/student/attempts/${id}/waiting`);
  if (attempt.state === "UPLOAD_ONLY") redirect(`/student/attempts/${id}/upload`);
  if (attempt.state === "FINISHED_REVIEW") redirect(`/student/attempts/${id}/finished`);


  if (!assessmentPackage) {
    return (
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-lg border border-[var(--border)] bg-white p-6">
        <AttemptStateBadge state={attempt.state} />
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">
            {attempt.delivery_mode === "seb_required" ? "Safe Exam Browser Required" : "Exam content is not available yet"}
          </h1>
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-100">
            <p className="font-bold">Verification Error:</p>
            <p>{packageError ?? "The server has not released the exam package for this attempt state."}</p>
          </div>
          {attempt.delivery_mode === "seb_required" && (
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              This exam is locked to a specific Safe Exam Browser configuration. Please ensure you are opening this page 
              inside the Safe Exam Browser application with the correct configuration file provided by your institution.
            </p>
          )}
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Current server state: {attempt.state}. Use the attempt dashboard to open the correct waiting, writing,
            upload, or finished screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/student">Back to assigned attempts</ButtonLink>
        </div>
      </section>
    );
  }
  const uploadNodes = flattenQuestionNodes(assessmentPackage.questions).filter((node) =>
    node.response_mode.includes("upload"),
  );
  return (
    <div className="exam-mode">
      <TelemetryListener attemptId={id} stateToken={stateToken} />
      <header className="sticky top-0 z-10 -mx-5 mb-8 border-b border-[var(--border)] bg-[rgba(246,249,255,0.96)] px-5 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AttemptStateBadge state="ACTIVE" />
            <div>
              <h1 className="font-semibold">{assessmentPackage.assessment.title}</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">
                {assessmentPackage.assessment.paper_code} · {attempt.delivery_mode === "seb_required" ? "Safe Exam Browser Mode" : "Browser Mode (Standard)"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LastSavedBadge responses={responses} />
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
        <QuestionPaper 
          questions={assessmentPackage.questions} 
          attemptId={id}
          ownerProfileId={attempt.owner_profile_id}
          stateToken={stateToken}
          responses={responses}
          annotations={screenData.annotations}
        />
        <aside className="grid content-start gap-4 xl:sticky xl:top-28 xl:self-start" aria-label="Response tools">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Response panel</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Typed answers autosave during ACTIVE. Upload URLs are issued one slot at a time.
            </p>
            <SubmitExamButton attemptId={id} stateToken={stateToken} className="mt-4" />
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
