import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { listAssessmentTemplates } from "@/lib/usability-data";

export default async function AssessmentTemplatesPage() {
  const templates = await listAssessmentTemplates();
  return (
    <>
      <SectionHeading
        title="Assessment Templates"
        description="Policy presets for common IB, Olympiad, quiz, and upload-only workflows."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id}>
            <h2 className="font-semibold">{template.name}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{template.description ?? "Custom owner template"}</p>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt>Duration</dt><dd className="font-semibold">{Math.round(template.default_duration_seconds / 60)} min</dd></div>
              <div className="flex justify-between gap-3"><dt>Upload grace</dt><dd className="font-semibold">{template.default_upload_grace_seconds ? `${Math.round(template.default_upload_grace_seconds / 60)} min` : "None"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Uploads</dt><dd className="font-semibold">{template.per_question_upload_enabled ? "Root question PDFs" : "Off"}</dd></div>
              <div className="flex justify-between gap-3"><dt>Typed</dt><dd className="font-semibold">{template.typed_enabled ? "Enabled" : "Disabled"}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
