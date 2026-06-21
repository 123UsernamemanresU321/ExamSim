import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MarkingWorkloadPage() {
  const { ownerProfileId } = await requireInstitutionPagePermission("moderation", "/owner/marking-queue/workload");
  const supabase = await createSupabaseServerClient();
  const [assignmentResult, submissionResult, reviewResult] = await Promise.all([
    supabase.from("marker_assignments").select("*").eq("owner_profile_id", ownerProfileId),
    supabase.from("marking_submissions").select("*").eq("owner_profile_id", ownerProfileId),
    supabase.from("marking_reviews").select("*").eq("owner_profile_id", ownerProfileId),
  ]);
  if (assignmentResult.error) throw assignmentResult.error;
  if (submissionResult.error) throw submissionResult.error;
  if (reviewResult.error) throw reviewResult.error;
  const assignments = assignmentResult.data ?? [];
  const submissions = submissionResult.data ?? [];
  const reviews = reviewResult.data ?? [];
  const markerIds = Array.from(new Set([
    ...assignments.map((assignment) => assignment.marker_profile_id),
    ...submissions.map((submission) => submission.marker_profile_id),
  ]));
  const { data: profiles, error: profileError } = markerIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", markerIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profileNameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const markerRows = markerIds.map((markerId) => {
    const markerAssignments = assignments.filter((assignment) => assignment.marker_profile_id === markerId);
    const markerSubmissions = submissions.filter((submission) => submission.marker_profile_id === markerId);
    const averageMarks = markerSubmissions.length
      ? markerSubmissions.reduce((sum, submission) => sum + Number(submission.total_awarded_marks), 0) / markerSubmissions.length
      : null;
    return {
      id: markerId,
      name: profileNameById.get(markerId) ?? `Marker ${markerId.slice(0, 8)}`,
      assigned: markerAssignments.filter((assignment) => assignment.status === "assigned").length,
      inProgress: markerAssignments.filter((assignment) => assignment.status === "in_progress").length,
      completed: markerAssignments.filter((assignment) => assignment.status === "completed" || assignment.status === "released").length,
      submissions: markerSubmissions.length,
      averageMarks,
    };
  });
  const reviewedDeltas = reviews.map((review) => Number(review.mark_delta)).filter(Number.isFinite);
  const averageDelta = reviewedDeltas.length ? reviewedDeltas.reduce((sum, value) => sum + value, 0) / reviewedDeltas.length : 0;
  const changedFinalMarks = reviews.filter((review) => review.final_submission_id && review.final_submission_id !== review.primary_submission_id).length;
  const pendingReviews = reviews.filter((review) => !["approved", "rejected"].includes(review.status)).length;

  return (
    <main className="space-y-6 pb-12">
      <SectionHeading title="Marker workload" description="Balance assignments and review inter-marker consistency using institution-scoped marking snapshots." />
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/owner/marking-queue" variant="secondary">Marking queue</ButtonLink>
        <ButtonLink href="/owner/marking-queue/moderation" variant="secondary">Moderation queue</ButtonLink>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned markers" value={markerRows.length} />
        <StatCard label="Pending reviews" value={pendingReviews} tone={pendingReviews ? "warning" : "neutral"} />
        <StatCard label="Average mark delta" value={averageDelta.toFixed(2)} tone={averageDelta > 2 ? "danger" : "neutral"} />
        <StatCard label="Adjudicated changes" value={changedFinalMarks} />
      </div>

      {markerRows.length ? (
        <DataTable headers={["Marker", "Queue", "Completed", "Submissions", "Average total"]}>
          {markerRows.map((marker) => (
            <DataTableRow key={marker.id}>
              <DataTableCell><p className="font-semibold text-[var(--ink)]">{marker.name}</p><p className="mt-1 font-mono text-xs text-[var(--muted)]">{marker.id.slice(0, 12)}</p></DataTableCell>
              <DataTableCell><div className="flex flex-wrap gap-2"><Badge>{marker.assigned} assigned</Badge><Badge tone={marker.inProgress ? "warning" : "neutral"}>{marker.inProgress} active</Badge></div></DataTableCell>
              <DataTableCell>{marker.completed}</DataTableCell>
              <DataTableCell>{marker.submissions}</DataTableCell>
              <DataTableCell>{marker.averageMarks == null ? "No snapshots" : marker.averageMarks.toFixed(2)}</DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      ) : <EmptyState title="No marker workload yet" description="Assign scripts or questions to markers to populate this operational view." />}

      <section className="border-t border-[var(--border)] pt-5">
        <h2 className="text-base font-semibold text-[var(--ink)]">Inter-marker consistency</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Deltas come from independent primary and secondary marking snapshots. They are operational signals, not automatic judgements about a marker.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={reviews.some((review) => review.status === "needs_adjudication") ? "danger" : "success"}>{reviews.filter((review) => review.status === "needs_adjudication").length} need adjudication</Badge>
          <Badge>{reviews.filter((review) => review.status === "approved").length} approved</Badge>
          <Badge>{submissions.filter((submission) => submission.marking_round === "secondary").length} secondary snapshots</Badge>
        </div>
      </section>
    </main>
  );
}
