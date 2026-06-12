import { SectionHeading } from "@/components/section-heading";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { listAssessmentTemplates } from "@/lib/usability-data";

export default async function AssessmentTemplatesPage() {
  const templates = await listAssessmentTemplates();
  return (
    <>
      <SectionHeading
        title="Assessment Templates"
        description="Policy presets for common IB, Olympiad, quiz, and upload-only workflows."
      />
      <DataTable headers={["Template", "Duration", "Upload grace", "Responses"]}>
        {templates.map((template) => (
          <DataTableRow key={template.id}>
            <DataTableCell className="w-[45%]">
              <p className="font-semibold text-[var(--ink)]">{template.name}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{template.description ?? "Custom owner template"}</p>
            </DataTableCell>
            <DataTableCell className="font-mono text-xs">{Math.round(template.default_duration_seconds / 60)} min</DataTableCell>
            <DataTableCell className="font-mono text-xs">{template.default_upload_grace_seconds ? `${Math.round(template.default_upload_grace_seconds / 60)} min` : "None"}</DataTableCell>
            <DataTableCell>
              <span className="text-xs text-[var(--muted)]">
                {template.per_question_upload_enabled ? "Root question PDFs" : "Uploads off"} · {template.typed_enabled ? "Typed enabled" : "Typed off"}
              </span>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>
    </>
  );
}
