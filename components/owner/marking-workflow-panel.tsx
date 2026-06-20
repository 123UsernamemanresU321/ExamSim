import { submitIndependentMarkingAction } from "@/app/owner/marking-queue/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AssessmentGradingPolicy, MarkingReview, MarkingSubmission } from "@/types/database";

export function MarkingWorkflowPanel({ attemptId, policy, submissions, review }: { attemptId: string; policy: AssessmentGradingPolicy | null; submissions: MarkingSubmission[]; review: MarkingReview | null }) {
  return (
    <section className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">Marking submission</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Save draft marks first, then submit an immutable review snapshot.</p>
        </div>
        {review ? <Badge tone={review.status === "approved" ? "success" : review.status === "rejected" || review.status === "needs_adjudication" ? "danger" : "warning"}>{review.status.replaceAll("_", " ")}</Badge> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {policy?.anonymous_grading ? <Badge tone="info">Anonymous</Badge> : null}
        {policy?.double_marking ? <Badge tone="neutral">Double marked</Badge> : null}
        {policy?.moderation_required ? <Badge tone="neutral">Reviewer gate</Badge> : null}
      </div>
      {submissions.length ? (
        <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
          {submissions.map((submission) => <p key={submission.id}><strong className="capitalize text-[var(--ink)]">{submission.marking_round}</strong> · {submission.total_awarded_marks} marks · {submission.status}</p>)}
        </div>
      ) : <p className="mt-3 text-xs text-[var(--muted)]">No marking snapshot has been submitted.</p>}
      <form action={submitIndependentMarkingAction.bind(null, attemptId)} className="mt-4">
        <Button type="submit">Submit current marks</Button>
      </form>
    </section>
  );
}
