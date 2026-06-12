import { redirect } from "next/navigation";
import { CountdownTimer } from "@/components/countdown-timer";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { ServerTimeVerificationCard } from "@/components/student/server-time-verification-card";
import { StudentMaterialsDrawer } from "@/components/student/allowed-materials-drawer";
import { formatInTimezone } from "@/lib/attempt-state";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { getStudentMaterialsForAttempt } from "@/lib/student-experience";

export default async function WaitingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { attempt } = await getAttemptScreenData(id, false);

  if (attempt.state === "ACTIVE") redirect(`/student/attempts/${id}/exam`);
  if (attempt.state === "UPLOAD_ONLY") redirect(`/student/attempts/${id}/upload`);
  if (attempt.state === "FINISHED_REVIEW") redirect(`/student/attempts/${id}/finished`);
  const materials = await getStudentMaterialsForAttempt(id);

  return (
    <div className="mx-auto max-w-[840px] px-2 py-4">
      <SectionHeading
        title="Lobby Waiting Room"
        description="Only exam metadata is preloaded before the official start time. Content is locked server-side to prevent client leaks."
      />
      <Card className="grid gap-8 rounded-lg px-6 py-8 md:px-10 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-5 border-b border-[var(--border)] pb-6">
          <AttemptStateBadge state={attempt.state} />
          <div className="rounded-lg bg-[var(--surface-muted)] p-2.5 border border-[var(--border)] shadow-sm">
            <CountdownTimer
              serverNowUtc={attempt.server_now_utc}
              targetUtc={attempt.countdown_target_utc}
              state={attempt.state}
            />
          </div>
        </div>
        <div>
          <h2 className="paper-body text-3xl font-semibold leading-snug text-[var(--ink)] md:text-4xl">{attempt.title}</h2>
          <p className="mt-2 text-sm font-semibold tracking-wide text-[var(--muted)]">
            Paper Reference: <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-xs">{attempt.paper_code || "General"}</code> · Starts {formatInTimezone(attempt.start_at_utc, attempt.display_timezone)}
          </p>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Please prepare your desktop environment and materials. When the countdown reaches zero, the workspace will automatically refresh to request the unlocked assessment package from the server.
        </p>
        <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--surface-muted)] p-4 text-xs leading-6 text-[var(--muted)] shadow-inner">
          <p className="font-bold text-[var(--primary)] mb-1">Defense-in-Depth Notice:</p>
          No hidden exam payload is present before ACTIVE. The remote decryption package is released exclusively through <code className="font-semibold">get-attempt-package</code> only after the UTC time passes the server-authoritative threshold.
        </div>
        <ServerTimeVerificationCard serverNowUtc={attempt.server_now_utc} timezone={attempt.display_timezone} />
        <StudentMaterialsDrawer materials={materials} />
        <div className="flex flex-wrap gap-3.5 border-t border-[var(--border)] pt-6 mt-2">
          <ButtonLink 
            href={`/student/attempts/${id}/readiness`} 
            variant="secondary"
          >
            Verify Device readiness
          </ButtonLink>
          <ButtonLink 
            href={`/student/attempts/${id}/recovery-status`} 
            variant="secondary"
          >
            Report Technical Issue
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
