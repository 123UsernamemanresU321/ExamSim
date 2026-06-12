import { Plus } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { DataListMeta, DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
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
        <DataTable headers={["Assessment title & code", "Status & badges", "Metadata", "Actions"]}>
          {assessments.map((assessment) => (
            <DataTableRow key={assessment.id}>
              <DataTableCell className="w-[38%]">
                <h2 className="text-lg font-semibold leading-6 text-black">{assessment.title}</h2>
                <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">{assessment.paper_code ?? "NO-CODE"}</p>
              </DataTableCell>
              <DataTableCell className="w-[24%]">
                <DataListMeta>
                  <AssessmentStatusBadge status={assessment.latest_status} />
                  <StatusBadge status={assessment.assessment_kind} />
                  <ParseBadge confidence={assessment.parse_confidence} />
                </DataListMeta>
              </DataTableCell>
              <DataTableCell className="w-[24%]">
                <p className="text-[13px] text-[var(--ink)]">{assessment.latest_version_id ? "Version ready" : "No version"}</p>
                <p className="mt-0.5 text-[13px] text-[var(--muted)]">Created {new Date(assessment.created_at).toLocaleDateString()}</p>
              </DataTableCell>
              <DataTableCell className="w-[14%]">
                <div className="flex items-center justify-end gap-2">
                <ButtonLink href={`/owner/assessments/${assessment.id}`} variant="secondary">
                  Open
                </ButtonLink>
                <DeleteAssessmentButton assessmentId={assessment.id} title={assessment.title} redirectTo={null} />
                </div>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      )}
    </>
  );
}
