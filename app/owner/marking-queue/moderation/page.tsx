import { reviewMarkingAction } from "@/app/owner/marking-queue/actions";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AssessmentGradingPolicy, MarkingReview, MarkingSubmission } from "@/types/database";

export default async function MarkingModerationPage() {
  const rows = await loadModerationRows();
  return (
    <main className="space-y-6 pb-12">
      <SectionHeading title="Marking moderation" description="Compare independent submissions, resolve material deltas, and approve the final marking snapshot before release." />
      <div><ButtonLink href="/owner/marking-queue" variant="secondary">Back to marking queue</ButtonLink></div>
      {rows.length === 0 ? <EmptyState title="No reviews waiting" description="Submitted marking snapshots appear here when double marking or moderation is required." /> : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <Card key={row.review.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">{row.policy?.anonymous_grading ? `Anonymous script ${row.review.attempt_id.slice(0, 8).toUpperCase()}` : `Attempt ${row.review.attempt_id.slice(0, 8)}`}</p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">{row.assessmentTitle}</h2>
                </div>
                <Badge tone={row.review.status === "needs_adjudication" ? "danger" : row.review.status === "approved" ? "success" : "warning"}>{row.review.status.replaceAll("_", " ")}</Badge>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Metric label="Primary" value={row.primary ? `${row.primary.total_awarded_marks} marks` : "Missing"} />
                <Metric label="Secondary" value={row.secondary ? `${row.secondary.total_awarded_marks} marks` : "Not submitted"} />
                <Metric label="Delta" value={row.review.mark_delta == null ? "Not available" : `${row.review.mark_delta} marks`} />
              </div>
              {row.review.status !== "approved" && row.review.status !== "rejected" ? (
                <form action={reviewMarkingAction.bind(null, row.review.id)} className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 md:grid-cols-2">
                  <Field label="Final marking snapshot" tooltip="Choose the independent submission that becomes authoritative after approval.">
                    <Select name="final_submission_id" defaultValue={row.primary?.id ?? ""}>
                      {row.primary ? <option value={row.primary.id}>Primary · {row.primary.total_awarded_marks} marks</option> : null}
                      {row.secondary ? <option value={row.secondary.id}>Secondary · {row.secondary.total_awarded_marks} marks</option> : null}
                    </Select>
                  </Field>
                  <Field label="Reviewer comment" tooltip="Record why the submission is approved or rejected. This remains in the marking audit trail.">
                    <Textarea name="reviewer_comment" rows={3} className="min-h-20" placeholder="Explain the moderation decision" />
                  </Field>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <Button name="decision" value="approved" type="submit" disabled={!row.primary}>Approve final marks</Button>
                    <Button name="decision" value="rejected" type="submit" variant="dangerSubtle">Return for correction</Button>
                    <ButtonLink href={`/owner/attempts/${row.review.attempt_id}/mark`} variant="secondary">Open script</ButtonLink>
                  </div>
                </form>
              ) : <p className="mt-4 text-sm text-[var(--muted)]">{row.review.reviewer_comment ?? "Review completed."}</p>}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 font-mono text-sm font-semibold text-[var(--ink)]">{value}</p></div>;
}

async function loadModerationRows() {
  const supabase = await createSupabaseServerClient();
  const { data: reviews, error: reviewError } = await supabase.from("marking_reviews").select("*").order("updated_at", { ascending: false });
  if (reviewError) throw reviewError;
  const attemptIds = (reviews ?? []).map((review) => review.attempt_id);
  if (!attemptIds.length) return [];
  const [{ data: attempts, error: attemptError }, { data: submissions, error: submissionError }] = await Promise.all([
    supabase.from("attempts").select("id,assessment_id").in("id", attemptIds),
    supabase.from("marking_submissions").select("*").in("attempt_id", attemptIds),
  ]);
  if (attemptError) throw attemptError;
  if (submissionError) throw submissionError;
  const assessmentIds = [...new Set((attempts ?? []).map((attempt) => attempt.assessment_id))];
  const [{ data: assessments, error: assessmentError }, { data: policies, error: policyError }] = await Promise.all([
    supabase.from("assessments").select("id,title").in("id", assessmentIds),
    supabase.from("assessment_grading_policies").select("*").in("assessment_id", assessmentIds),
  ]);
  if (assessmentError) throw assessmentError;
  if (policyError) throw policyError;
  const attemptById = new Map((attempts ?? []).map((attempt) => [attempt.id, attempt]));
  const assessmentById = new Map((assessments ?? []).map((assessment) => [assessment.id, assessment]));
  const policyByAssessment = new Map((policies ?? []).map((policy) => [policy.assessment_id, policy as AssessmentGradingPolicy]));
  const submissionById = new Map((submissions ?? []).map((submission) => [submission.id, submission as MarkingSubmission]));
  return (reviews ?? []).map((review) => {
    const typedReview = review as MarkingReview;
    const attempt = attemptById.get(typedReview.attempt_id);
    return {
      review: typedReview,
      assessmentTitle: attempt ? assessmentById.get(attempt.assessment_id)?.title ?? "Assessment" : "Assessment",
      policy: attempt ? policyByAssessment.get(attempt.assessment_id) ?? null : null,
      primary: submissionById.get(typedReview.primary_submission_id) ?? null,
      secondary: typedReview.secondary_submission_id ? submissionById.get(typedReview.secondary_submission_id) ?? null : null,
    };
  });
}
