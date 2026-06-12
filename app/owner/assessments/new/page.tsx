import { CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { NewAssessmentForm } from "@/components/owner/new-assessment-form";
import { QtiImportForm } from "@/components/owner/qti-import-form";
import { listAssessmentTemplates } from "@/lib/usability-data";

export default async function NewAssessmentPage() {
  const templates = await listAssessmentTemplates();
  return (
    <>
      <PageHeader
        eyebrow="Assessments"
        title="Create Assessment"
        description="Upload PDF, paste LaTeX, or import a normalized JSON package. Sources are stored in private Storage."
      />
      <div className="grid max-w-[1200px] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit">
          <h2 className="text-lg font-semibold leading-6 text-black">Creation Flow</h2>
          <div className="relative mt-6 grid gap-7">
            <span className="absolute bottom-6 left-[11px] top-3 w-px bg-[var(--border)]" aria-hidden="true" />
            {["Metadata & Setup", "File Upload", "Security Settings", "Review & Publish"].map((step, index) => {
              const isActive = index === 0;
              return (
                <div key={step} className="relative flex gap-4">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full border bg-white ${isActive ? "border-[var(--primary)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
                    {isActive ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                  </span>
                  <span>
                    <span className={`block text-xs font-semibold uppercase tracking-[0.05em] ${isActive ? "text-[var(--primary-strong)]" : "text-[var(--muted)]"}`}>Step {index + 1}</span>
                    <span className={`mt-1 block text-sm ${isActive ? "font-medium text-black" : "text-[var(--muted)]"}`}>{step}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="grid gap-5">
          <Card>
            <NewAssessmentForm templates={templates} />
          </Card>
          <Card className="shadow-none">
            <h2 className="mb-4 text-lg font-semibold leading-6 text-black">QTI import</h2>
            <QtiImportForm />
          </Card>
        </div>
      </div>
    </>
  );
}
