import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";

export default function NewAssessmentPage() {
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
        <form className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <Input name="title" placeholder="Olympiad Mock Paper 1" />
            </Field>
            <Field label="Paper code">
              <Input name="paper_code" placeholder="MATH-MOCK-01" />
            </Field>
            <Field label="Assessment kind">
              <select className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3">
                <option>practice_paper</option>
                <option>quiz</option>
                <option>test</option>
                <option>exam</option>
              </select>
            </Field>
            <Field label="Source kind">
              <select className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3">
                <option>json</option>
                <option>latex</option>
                <option>pdf</option>
              </select>
            </Field>
          </div>
          <Field label="LaTeX or JSON source" description="PDF upload uses the same ingest Edge Function with a private object path.">
            <Textarea placeholder="Paste LaTeX or normalized JSON package here." />
          </Field>
          <Button className="justify-self-start" type="button">Create draft version</Button>
        </form>
      </Card>
    </>
  );
}
