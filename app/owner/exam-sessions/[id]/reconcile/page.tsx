import { notFound } from "next/navigation";
import {
  approveAttemptClaimAction,
  linkGuestAttemptToRosterAction,
  markGuestIdentityResolvedAction,
  rejectAttemptClaimAction,
} from "@/app/owner/exam-sessions/[id]/reconcile/actions";
import { AttemptClaimCodeManager } from "@/components/owner/attempt-claim-code-manager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/section-heading";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getOwnerExamSession, getReconciliationCandidates } from "@/lib/examsim/session-data";

export default async function ReconcileGuestAttemptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, candidates] = await Promise.all([getOwnerExamSession(id), getReconciliationCandidates(id)]);
  if (!session) notFound();
  return (
    <>
      <Breadcrumb
        items={[
          { label: "Exam Sessions", href: "/owner/exam-sessions" },
          { label: session.title, href: `/owner/exam-sessions/${id}` },
          { label: "Reconciliation" },
        ]}
      />
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
                <div className="grid content-start gap-2">
                  {candidate.requestedProfile ? (
                    <div className="rounded-[4px] border border-[#e6c577] bg-[var(--warning-bg)] p-3 text-xs text-[#5f4510]">
                      <p className="font-semibold">Claim requested by {candidate.requestedProfile.display_name}</p>
                      <p className="mt-1">Approve only after checking the student number and roster identity.</p>
                      <div className="mt-3 flex gap-2">
                        <form action={approveAttemptClaimAction.bind(null, id, candidate.attempt.id)}>
                          <Button type="submit">Approve claim</Button>
                        </form>
                        <form action={rejectAttemptClaimAction.bind(null, id, candidate.attempt.id)}>
                          <Button type="submit" variant="dangerSubtle">Reject</Button>
                        </form>
                      </div>
                    </div>
                  ) : null}
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
                  {!candidate.requestedProfile ? <AttemptClaimCodeManager attemptId={candidate.attempt.id} /> : null}
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
