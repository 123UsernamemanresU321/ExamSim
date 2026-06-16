import { notFound } from "next/navigation";
import { linkGuestAttemptToRosterAction, markGuestIdentityResolvedAction } from "@/app/owner/exam-sessions/[id]/reconcile/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/section-heading";
import { getOwnerExamSession, getReconciliationCandidates } from "@/lib/examsim/session-data";

export default async function ReconcileGuestAttemptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, candidates] = await Promise.all([getOwnerExamSession(id), getReconciliationCandidates(id)]);
  if (!session) notFound();
  return (
    <>
      <SectionHeading title="Guest attempt reconciliation" description="Resolve ambiguous no-login identities and link attempts to roster/account records when available." />
      {candidates.length ? (
        <div className="grid gap-4">
          {candidates.map((candidate) => (
            <Card key={candidate.attempt.id}>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px_auto]">
                <div>
                  <p className="text-lg font-semibold text-[var(--ink)]">{candidate.guestName}</p>
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">{candidate.guestNumber ?? candidate.attempt.id}</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">Review status: {candidate.attempt.identity_review_status ?? "not_required"} · Claim: {candidate.attempt.claim_status ?? "not_required"}</p>
                </div>
                <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                  <p className="font-semibold text-[var(--ink)]">Roster suggestion</p>
                  <p className="mt-1 text-[var(--muted)]">{candidate.matchedRosterEntry?.display_name ?? "No exact roster match"}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {candidate.matchedRosterEntry ? (
                    <form action={linkGuestAttemptToRosterAction.bind(null, id)}>
                      <input type="hidden" name="attempt_id" value={candidate.attempt.id} />
                      <input type="hidden" name="roster_entry_id" value={candidate.matchedRosterEntry.id} />
                      <Button type="submit">Link match</Button>
                    </form>
                  ) : null}
                  <form action={markGuestIdentityResolvedAction.bind(null, id, candidate.attempt.id)}>
                    <Button type="submit" variant="secondary">Mark reviewed</Button>
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No guest identities need review" description="All guest attempts for this session are either linked or marked reviewed." />
      )}
    </>
  );
}
