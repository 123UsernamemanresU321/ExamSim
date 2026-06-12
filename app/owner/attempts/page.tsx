import { SectionHeading } from "@/components/section-heading";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { listOwnerAttempts } from "@/lib/live-data";

export default async function OwnerAttemptsPage() {
  const attempts = await listOwnerAttempts();
  return (
    <>
      <SectionHeading
        title="Attempts"
        description="Owner view of upcoming, active, upload-only, and review-ready sittings."
      />
      {attempts.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--muted)]">No attempts scheduled yet.</p>
        </Card>
      ) : (
        <DataList>
          {attempts.map((attempt) => (
            <DataListRow key={attempt.id} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <DataListMeta className="mb-2">
                  <AttemptStateBadge state={attempt.state} />
                  <span className="font-semibold text-[var(--muted)]">{attempt.student}</span>
                </DataListMeta>
                <h2 className="truncate text-base font-semibold text-[var(--ink)]">{attempt.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{attempt.paper_code ?? "No paper code"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <ButtonLink href={`/owner/attempts/${attempt.id}`} variant="secondary">
                  Review
                </ButtonLink>
              </div>
            </DataListRow>
          ))}
        </DataList>
      )}
    </>
  );
}
