import { createRubricTemplateAction, createRubricTemplateItemAction } from "@/app/owner/assessments/[id]/authoring/actions";
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
        <DataTable headers={["Template", "Subject", "Point bank", "Updated"]}>
          {workspace.rubricTemplates.map((template) => (
            <DataTableRow key={template.id}>
              <DataTableCell>
                <span className="font-semibold text-[var(--ink)]">{template.name}</span>
                {template.description ? <p className="mt-1 max-w-md text-xs leading-5 text-[var(--muted)]">{template.description}</p> : null}
              </DataTableCell>
              <DataTableCell>{template.subject ?? "General"}</DataTableCell>
              <DataTableCell>
                <div className="grid gap-1">
                  {workspace.rubricTemplateItems.filter((item) => item.rubric_template_id === template.id).map((item) => (
                    <div key={item.id} className="rounded-[3px] border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1">
                      <span className="font-semibold text-[var(--ink)]">{item.mark_code ? `${item.mark_code}: ` : ""}{item.label}</span>
                      <span className="ml-2 font-mono text-xs text-[var(--muted)]">{item.max_marks}m</span>
                    </div>
                  ))}
                  {!workspace.rubricTemplateItems.some((item) => item.rubric_template_id === template.id) ? (
                    <span className="text-xs italic text-[var(--muted)]">No point items yet</span>
                  ) : null}
                </div>
              </DataTableCell>
              <DataTableCell>{new Date(template.updated_at).toLocaleDateString()}</DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
        <div className="grid gap-5">
          <Card>
            <h2 className="text-base font-semibold text-[var(--ink)]">Create template</h2>
            <form action={createRubricTemplateAction.bind(null, id)} className="mt-4 grid gap-3">
              <input name="name" placeholder="M1/A1/B1 proof rubric" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" required />
              <input name="subject" placeholder="Subject" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
              <textarea name="description" placeholder="When to use this rubric..." className="min-h-28 rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
              <Button type="submit">Create rubric template</Button>
            </form>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-[var(--ink)]">Add rubric point</h2>
            <form action={createRubricTemplateItemAction.bind(null, id)} className="mt-4 grid gap-3">
              <select name="rubric_template_id" className="rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm" required>
                <option value="">Choose template</option>
                {workspace.rubricTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <div className="grid grid-cols-[90px_minmax(0,1fr)_90px] gap-2">
                <input name="mark_code" placeholder="M1" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
                <input name="label" placeholder="Correct substitution" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" required />
                <input name="max_marks" type="number" min="0" step="0.5" defaultValue="1" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
              </div>
              <textarea name="description" placeholder="Criterion details..." className="min-h-20 rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
              <textarea name="feedback_text" placeholder="Optional student-facing feedback when this point is awarded..." className="min-h-20 rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
              <Button type="submit" variant="secondary">Add point</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
