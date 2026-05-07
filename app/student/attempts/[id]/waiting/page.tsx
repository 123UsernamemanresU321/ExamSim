import { redirect } from "next/navigation";
import { CountdownTimer } from "@/components/countdown-timer";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { formatInTimezone } from "@/lib/attempt-state";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { demoAttemptParams } from "@/lib/static-params";

export function generateStaticParams() {
  return demoAttemptParams();
}

export default async function WaitingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { attempt } = await getAttemptScreenData(id, false);

  if (attempt.state === "ACTIVE") redirect(`/student/attempts/${id}/exam`);
  if (attempt.state === "UPLOAD_ONLY") redirect(`/student/attempts/${id}/upload`);
  if (attempt.state === "FINISHED_REVIEW") redirect(`/student/attempts/${id}/finished`);

  return (
    <div className="mx-auto max-w-[840px]">
      <SectionHeading
        title="Waiting room"
        description="Only metadata is shown before start time. The assessment package is not requested or rendered here."
      />
      <Card className="paper-sheet grid gap-7 px-7 py-8 md:px-12 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <AttemptStateBadge state={attempt.state} />
          <CountdownTimer
            serverNowUtc={attempt.server_now_utc}
            targetUtc={attempt.countdown_target_utc}
            state={attempt.state}
          />
        </div>
        <div>
          <h2 className="paper-body text-3xl font-semibold">{attempt.title}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {attempt.paper_code} · Starts {formatInTimezone(attempt.start_at_utc, attempt.display_timezone)}
          </p>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Prepare your workspace. When the local countdown reaches zero, the client refreshes server state; the
          browser does not unlock content by itself.
        </p>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">
          The server will release the normalized package only after `get-attempt-state` computes ACTIVE.
          This page intentionally has no hidden exam payload.
        </div>
      </Card>
    </div>
  );
}
