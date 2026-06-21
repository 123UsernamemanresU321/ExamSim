import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewAssessmentVersionAction } from "./actions";

export default async function AssessmentApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;
  const context = await requireInstitutionPagePermission("moderation", `/owner/assessments/${assessmentId}/approval`);
  const supabase = await createSupabaseServerClient();
  const [{ data: assessment, error: assessmentError }, { data: versions, error: versionError }] = await Promise.all([
    supabase.from("assessments").select("id,title,paper_code").eq("id", assessmentId).eq("owner_profile_id", context.ownerProfileId).maybeSingle(),
    supabase
      .from("assessment_versions")
      .select("id,version_no,status,governance_status,requires_owner_review,created_at,published_at")
      .eq("assessment_id", assessmentId)
      .order("version_no", { ascending: false }),
  ]);
  if (assessmentError) throw assessmentError;
  if (versionError) throw versionError;
  if (!assessment) return <SectionHeading title="Assessment not found" description="This assessment is unavailable in your institution workspace." />;
  const versionRows = versions ?? [];
  const latestVersion = versionRows[0];
  const { data: reviews, error: reviewError } = latestVersion
    ? await supabase
        .from("assessment_version_reviews")
        .select("id,reviewer_profile_id,decision,previous_status,new_status,comments,checklist_json,created_at")
        .eq("assessment_version_id", latestVersion.id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (reviewError) throw reviewError;

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Publishing approval"
        description={`${assessment.title} · Review is separate from authoring so critical exam content cannot be published by an unchecked client action.`}
      />
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/owner/assessments/${assessmentId}`} variant="secondary">Assessment overview</ButtonLink>
        <ButtonLink href={`/owner/assessments/${assessmentId}/health`} variant="secondary">Open health check</ButtonLink>
        <ButtonLink href={`/owner/assessments/${assessmentId}/history`} variant="secondary">Version history</ButtonLink>
      </div>

      {!latestVersion ? (
        <Card><p className="text-sm text-[var(--muted)]">No assessment version is available for review.</p></Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Version {latestVersion.version_no}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Created {formatDate(latestVersion.created_at)}. Published versions remain read-only.</p>
            </div>
            <Badge tone={governanceTone(latestVersion.governance_status)}>{latestVersion.governance_status}</Badge>
          </div>

          {latestVersion.status === "published" || latestVersion.status === "archived" ? (
            <p className="mt-5 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">This frozen version cannot re-enter review. Duplicate it as a new draft from Version history.</p>
          ) : (
            <form action={reviewAssessmentVersionAction.bind(null, assessmentId, latestVersion.id)} className="mt-5 space-y-4 border-t border-[var(--border)] pt-4">
              <fieldset>
                <legend className="text-sm font-semibold">Approval checklist</legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ChecklistItem name="question_structure" label="Question structure and answer types reviewed" />
                  <ChecklistItem name="source_coverage" label="Source regions and confidence items reviewed" />
                  <ChecklistItem name="marks_and_rubrics" label="Marks, markscheme mappings, and rubrics reviewed" />
                  <ChecklistItem name="publish_health" label="Publish health blockers resolved" />
                </div>
              </fieldset>
              <label className="block text-sm font-semibold" htmlFor="review-comments">
                Reviewer comments
                <textarea
                  id="review-comments"
                  name="comments"
                  maxLength={4000}
                  rows={4}
                  className="mt-2 w-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal"
                  placeholder="Record decisions, required corrections, or the evidence used for approval."
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {latestVersion.governance_status === "draft" ? <Button name="decision" value="reviewed" type="submit">Mark reviewed</Button> : null}
                {latestVersion.governance_status === "reviewed" ? <Button name="decision" value="approved" type="submit">Approve for publishing</Button> : null}
                {latestVersion.governance_status === "reviewed" || latestVersion.governance_status === "approved" ? (
                  <Button name="decision" value="rejected" type="submit" variant="dangerSubtle">Return to draft</Button>
                ) : null}
              </div>
            </form>
          )}
        </Card>
      )}

      <Card>
        <h2 className="text-base font-semibold">Review audit trail</h2>
        {(reviews ?? []).length ? (
          <div className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {(reviews ?? []).map((review) => (
              <div key={review.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={review.decision === "approved" ? "success" : review.decision === "rejected" ? "danger" : "neutral"}>{review.decision}</Badge>
                  <span className="font-medium">{review.previous_status} → {review.new_status}</span>
                  <span className="text-xs text-[var(--muted)]">{formatDate(review.created_at)}</span>
                </div>
                {review.comments ? <p className="mt-2 leading-6 text-[var(--muted)]">{review.comments}</p> : null}
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-[var(--muted)]">No review decisions have been recorded for the latest version.</p>}
      </Card>
    </div>
  );
}

function ChecklistItem({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-start gap-2 border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
      <input className="mt-0.5" type="checkbox" name={name} />
      <span>{label}</span>
    </label>
  );
}

function governanceTone(status: string): "neutral" | "warning" | "success" {
  if (status === "approved" || status === "published") return "success";
  if (status === "reviewed") return "warning";
  return "neutral";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
