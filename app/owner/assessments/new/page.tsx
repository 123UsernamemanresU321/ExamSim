import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { NewAssessmentForm } from "@/components/owner/new-assessment-form";
import { QtiImportForm } from "@/components/owner/qti-import-form";
import { listAssessmentTemplates } from "@/lib/usability-data";

export default async function NewAssessmentPage() {
  const templates = await listAssessmentTemplates();
  return (
    <>
      <SectionHeading
        title="Create assessment"
        description="Upload PDF, paste LaTeX, or import a normalized JSON package. Sources are stored in private Storage."
      />
      <Card className="paper-sheet mx-auto max-w-[920px]">
        <div className="mb-6 grid gap-2 border-b border-[var(--border)] pb-5 text-sm text-[var(--muted)] md:grid-cols-4">
          {["Metadata", "Source", "Timing", "Security review"].map((step) => (
            <span key={step} className="rounded-md bg-[var(--surface-muted)] px-3 py-2 font-semibold">
              {step}
            </span>
          ))}
        </div>
        <NewAssessmentForm templates={templates} />
      </Card>
      <Card className="mx-auto mt-5 max-w-[920px] shadow-none">
        <h2 className="mb-4 text-lg font-semibold">QTI import</h2>
        <QtiImportForm />
      </Card>
    </>
  );
}
