import { SectionHeading } from "@/components/section-heading";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listOwnerAttempts } from "@/lib/live-data";

export default async function OwnerAttemptsPage() {
  const attempts = await listOwnerAttempts();
  return (
    <>
      <SectionHeading
        title="Attempts"
        description="Owner view of upcoming, active, upload-only, and review-ready sittings."
      />
      <div className="grid gap-3">
        {attempts.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--muted)]">No attempts scheduled yet.</p>
          </Card>
        ) : (
          attempts.map((attempt) => (
            <Card key={attempt.id} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 flex gap-2">
                  <AttemptStateBadge state={attempt.state} />
                  <span className="text-xs font-semibold text-[var(--muted)]">{attempt.student}</span>
                </div>
                <h2 className="font-semibold">{attempt.title}</h2>
                <p className="text-sm text-[var(--muted)]">{attempt.paper_code}</p>
              </div>
              <ButtonLink href={`/owner/attempts/${attempt.id}`} variant="secondary">
                Review
              </ButtonLink>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
