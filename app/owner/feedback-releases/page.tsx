import { Eye, EyeOff, Layers, ShieldCheck, Users } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { listFeedbackReleaseControlRows } from "@/lib/usability-data";

type FeedbackReleaseControlRow = Awaited<ReturnType<typeof listFeedbackReleaseControlRows>>[number];
type RelatedAssessment = { title?: string | null; paper_code?: string | null };
type RelatedProfile = { display_name?: string | null };
type ReleaseAttempt = FeedbackReleaseControlRow["attempt"] & {
  assessments?: RelatedAssessment | RelatedAssessment[] | null;
  profiles?: RelatedProfile | RelatedProfile[] | null;
};

export default async function FeedbackReleaseControlPage() {
  const rows = await listFeedbackReleaseControlRows();

  const cohorts: Record<string, FeedbackReleaseControlRow[]> = {};
  rows.forEach((row) => {
    const attempt = row.attempt as ReleaseAttempt;
    const assessment = firstRelated(attempt.assessments);
    const key = assessment?.title ?? "General Assessment Cohort";
    if (!cohorts[key]) cohorts[key] = [];
    cohorts[key].push(row);
  });

  const cohortKeys = Object.keys(cohorts);
  const releasedTotal = rows.filter((r) => r.release?.visible_to_student).length;

  return (
    <main className="space-y-8 pb-12">
      <SectionHeading
        title="Feedback release control"
        description="Release marks, comments, and annotated PDFs only when moderation and review are ready."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Assessment groups" value={cohortKeys.length} icon={<Layers size={18} aria-hidden="true" />} />
        <StatCard label="Released scripts" value={`${releasedTotal} / ${rows.length}`} tone={releasedTotal === rows.length && rows.length > 0 ? "success" : "info"} icon={<Users size={18} aria-hidden="true" />} />
        <StatCard
          label="Student visibility"
          value="Release-gated"
          description="Draft marks, private notes, and unreleased annotated PDFs stay hidden."
          icon={<ShieldCheck size={18} aria-hidden="true" />}
        />
      </div>

      <div className="space-y-8">
        {cohortKeys.length === 0 ? (
          <EmptyState
            title="No feedback waiting for release"
            description="Attempts appear here when marking output is available for release review."
          />
        ) : (
          cohortKeys.map((cohortName) => {
            const cohortRows = cohorts[cohortName] ?? [];
            const releasedCount = cohortRows.filter((r) => r.release?.visible_to_student).length;
            const totalCount = cohortRows.length;
            const isFullyReleased = releasedCount === totalCount;

            return (
              <div key={cohortName} className="space-y-4">
                <SectionHeader
                  title={cohortName}
                  description={`Released ${releasedCount} of ${totalCount} scripts.`}
                  actions={
                    <Badge tone={isFullyReleased ? "success" : "warning"} className="uppercase tracking-[0.08em]">
                      {isFullyReleased ? "Complete" : "In progress"}
                    </Badge>
                  }
                />

                <DataList>
                  {cohortRows.map(({ attempt, release }) => {
                    const attemptWithRelations = attempt as ReleaseAttempt;
                    const assessment = firstRelated(attemptWithRelations.assessments);
                    const student = firstRelated(attemptWithRelations.profiles);
                    const isReleased = Boolean(release?.visible_to_student);

                    return (
                      <DataListRow 
                        key={attempt.id} 
                        className={`grid gap-4 border-l-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${isReleased ? "border-l-[var(--success)]" : "border-l-[var(--border)]"}`}
                      >
                        <div className="min-w-0">
                          <DataListMeta className="mb-2">
                            <Badge 
                              tone={isReleased ? "success" : "neutral"}
                              className="uppercase tracking-[0.08em]"
                            >
                              <span className="mr-1 inline-block -mt-0.5">
                                {isReleased ? <Eye size={10} /> : <EyeOff size={10} />}
                              </span>
                              {isReleased ? "Visible to student" : "Held"}
                            </Badge>
                            
                            {release?.release_annotated_pdfs && (
                              <Badge tone="info" className="uppercase tracking-[0.08em]">
                                Annotated PDF
                              </Badge>
                            )}
                            {release?.release_comments && (
                              <Badge tone="info" className="uppercase tracking-[0.08em]">
                                Comments
                              </Badge>
                            )}
                            {release?.release_marks && (
                              <Badge tone="info" className="uppercase tracking-[0.08em]">
                                Marks
                              </Badge>
                            )}
                          </DataListMeta>

                          <h4 className="truncate text-sm font-semibold text-[var(--ink)]">
                            {student?.display_name ?? "Simulation candidate"}
                          </h4>
                          <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                            Paper: {assessment?.paper_code ?? "N/A"} · ID: {attempt.id.slice(0, 8).toUpperCase()}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <ButtonLink 
                            href={`/owner/attempts/${attempt.id}/mark`}
                          >
                            Open release panel
                          </ButtonLink>
                          
                          <ButtonLink 
                            href={`/student/attempts/${attempt.id}/receipt`} 
                            variant="secondary"
                          >
                            Receipt
                          </ButtonLink>
                        </div>
                      </DataListRow>
                    );
                  })}
                </DataList>

              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

function firstRelated<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}
