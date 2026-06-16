import { createRubricTemplateAction } from "@/app/owner/assessments/[id]/authoring/actions";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { getAssessmentAuthoringWorkspace } from "@/lib/examsim/authoring-data";

export default async function RubricTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAssessmentAuthoringWorkspace(id);
  return (
    <>
      <SectionHeading title="Rubrics and Reusable Feedback" description="Build reusable rubric templates and M1/A1/B1-style point banks for marking." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable headers={["Template", "Subject", "Tags", "Updated"]}>
          {workspace.rubricTemplates.map((template) => (
            <DataTableRow key={template.id}>
              <DataTableCell><span className="font-semibold text-[var(--ink)]">{template.name}</span></DataTableCell>
              <DataTableCell>{template.subject ?? "General"}</DataTableCell>
              <DataTableCell>{template.tags.join(", ") || "No tags"}</DataTableCell>
              <DataTableCell>{new Date(template.updated_at).toLocaleDateString()}</DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
        <Card>
          <h2 className="text-base font-semibold text-[var(--ink)]">Create template</h2>
          <form action={createRubricTemplateAction.bind(null, id)} className="mt-4 grid gap-3">
            <input name="name" placeholder="M1/A1/B1 proof rubric" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" required />
            <input name="subject" placeholder="Subject" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
            <textarea name="description" placeholder="When to use this rubric..." className="min-h-28 rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
            <Button type="submit">Create rubric template</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
