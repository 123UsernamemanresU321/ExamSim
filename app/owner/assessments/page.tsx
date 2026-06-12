import { Plus } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { AssessmentStatusBadge, ParseBadge, StatusBadge } from "@/components/ui/status-badge";
import { DeleteAssessmentButton } from "@/components/owner/delete-assessment-button";
import { listOwnerAssessments } from "@/lib/live-data";

export default async function OwnerAssessmentsPage() {
  const assessments = await listOwnerAssessments();
  return (
    <>
      <SectionHeading
        title="Assessments"
        description="Create, review, publish, and reuse assessment versions."
        actions={<ButtonLink href="/owner/assessments/new">
          <Plus size={16} aria-hidden="true" />
          New assessment
        </ButtonLink>}
      />
      {assessments.length === 0 ? (
        <EmptyState
          title="No assessments yet"
          description="Create an assessment, upload source material, and keep it in review until the parser tree and security settings are approved."
          action={<ButtonLink href="/owner/assessments/new">Create assessment</ButtonLink>}
        />
      ) : (
        <DataList>
          {assessments.map((assessment) => (
            <DataListRow key={assessment.id} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <DataListMeta className="mb-2">
                  <AssessmentStatusBadge status={assessment.latest_status} />
                  <StatusBadge status={assessment.assessment_kind} />
                  <ParseBadge confidence={assessment.parse_confidence} />
                </DataListMeta>
                <h2 className="truncate text-base font-semibold text-[var(--ink)]">{assessment.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{assessment.paper_code ?? "No paper code"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <ButtonLink href={`/owner/assessments/${assessment.id}`} variant="secondary">
                  Open
                </ButtonLink>
                <DeleteAssessmentButton assessmentId={assessment.id} title={assessment.title} redirectTo={null} />
              </div>
            </DataListRow>
          ))}
        </DataList>
      )}
    </>
  );
}
