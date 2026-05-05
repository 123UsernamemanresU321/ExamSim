import { SectionHeading } from "@/components/section-heading";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { attemptWithState, sampleAttempts } from "@/lib/demo-data";

export default function OwnerAttemptsPage() {
  return (
    <>
      <SectionHeading
        title="Attempts"
        description="Owner view of upcoming, active, upload-only, and review-ready sittings."
      />
      <div className="grid gap-3">
        {sampleAttempts.map((attempt) => {
          const withState = attemptWithState(attempt.id);
          return (
            <Card key={attempt.id} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 flex gap-2">
                  <AttemptStateBadge state={withState.state} />
                  <span className="text-xs font-semibold text-[var(--muted)]">{attempt.student}</span>
                </div>
                <h2 className="font-semibold">{attempt.title}</h2>
                <p className="text-sm text-[var(--muted)]">{attempt.paper_code}</p>
              </div>
              <ButtonLink href={`/owner/attempts/${attempt.id}`} variant="secondary">
                Review
              </ButtonLink>
            </Card>
          );
        })}
      </div>
    </>
  );
}
