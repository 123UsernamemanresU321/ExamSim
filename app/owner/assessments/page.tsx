import { Plus } from "lucide-react";
import Link from "next/link";
import { SavedViewsToolbar } from "@/components/owner/saved-views-toolbar";
import { SectionHeading } from "@/components/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { DataListMeta, DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { AssessmentStatusBadge, ParseBadge, StatusBadge } from "@/components/ui/status-badge";
import { DeleteAssessmentButton } from "@/components/owner/delete-assessment-button";
import { listOwnerAssessments } from "@/lib/live-data";
import { listOwnerSavedViews } from "@/lib/owner-operations";

export default async function OwnerAssessmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const [allAssessments, views] = await Promise.all([listOwnerAssessments(), listOwnerSavedViews("assessments")]);
  const assessments = allAssessments.filter((assessment) => {
    const haystack = `${assessment.title} ${assessment.paper_code ?? ""} ${assessment.assessment_kind}`.toLowerCase();
    const matchesQuery = !q || haystack.includes(q.toLowerCase());
    const matchesStatus = !status || assessment.latest_status === status;
    return matchesQuery && matchesStatus;
  });
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
      <div className="mb-4 grid gap-3">
        <SavedViewsToolbar scope="assessments" views={views} basePath="/owner/assessments" currentFilters={{ q, status }} />
        <form className="flex flex-wrap gap-2 rounded-[4px] border border-[var(--border)] bg-white p-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Filter by title, code, or kind"
            className="h-10 min-w-[240px] flex-1 rounded-[2px] border border-[var(--border)] px-3 text-sm"
          />
          <select name="status" defaultValue={status} className="h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="review_required">Review required</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <button type="submit" className="h-10 rounded-[2px] bg-[var(--primary)] px-4 text-sm font-semibold !text-white">Apply filters</button>
          <Link href="/owner/assessments" className="inline-flex h-10 items-center rounded-[2px] border border-[var(--border)] px-4 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-muted)]">
            Reset
          </Link>
        </form>
      </div>
      {assessments.length === 0 ? (
        <EmptyState
          title={allAssessments.length ? "No assessments match these filters" : "No assessments yet"}
          description={allAssessments.length ? "Adjust the saved view or clear filters to see more assessment records." : "Create an assessment, upload source material, and keep it in review until the parser tree and security settings are approved."}
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
