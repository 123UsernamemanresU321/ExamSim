"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { uploadSizeLabel, validatePdfUpload } from "@/lib/upload-policy";

type IngestResult = {
  assessment_id: string;
  draft_version_id: string;
  parse_confidence: number;
  requires_owner_review: boolean;
};

function parseJsonPackage(raw: string) {
  if (!raw.trim()) return undefined;
  return JSON.parse(raw) as Record<string, unknown>;
}

export function NewAssessmentForm() {
  const router = useRouter();
  const [sourceKind, setSourceKind] = useState("json");
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<IngestResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("Creating draft version...");
    setCreated(null);

    try {
      const form = new FormData(event.currentTarget);
      const sourceText = String(form.get("source_text") ?? "");
      const pdfFile = form.get("pdf_source");
      const pdfPayload = sourceKind === "pdf" && pdfFile instanceof File && pdfFile.size > 0
        ? await readPdfUpload(pdfFile)
        : null;
      if (sourceKind === "pdf" && !pdfPayload) {
        throw new Error("Choose a PDF file to upload.");
      }
      const body = {
        title: String(form.get("title") ?? ""),
        paper_code: String(form.get("paper_code") ?? "") || undefined,
        external_schedule_ref: String(form.get("external_schedule_ref") ?? "") || undefined,
        assessment_kind: String(form.get("assessment_kind") ?? "exam"),
        source_kind: sourceKind,
        latex_source: sourceKind === "latex" ? sourceText : undefined,
        json_package: sourceKind === "json" ? parseJsonPackage(sourceText) : undefined,
        pdf_source_base64: pdfPayload?.base64,
        pdf_source_filename: pdfPayload?.filename,
        pdf_source_content_type: pdfPayload?.contentType,
      };

      const supabase = createSupabaseBrowserClient();
      const data = await invokeEdgeFunction<IngestResult>(supabase, "ingest-assessment", { body });
      setCreated(data ?? null);
      setMessage("Draft assessment created.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create assessment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Title"
          description="The student-facing name of this assessment. Use a precise name you can distinguish later, such as the olympiad, subject, paper number, and year."
        >
          <Input name="title" placeholder="Olympiad Mock Paper 1" required />
        </Field>
        <Field
          label="Paper code"
          description="Optional stable identifier shared with schedules or exports. Keep it short, for example IB-MAA-HL-P1-2026 or SAMO-R2-MOCK."
        >
          <Input name="paper_code" placeholder="MATH-MOCK-01" />
        </Field>
        <Field
          label="External schedule ref"
          description="Optional integration key for a calendar or external timetable. Exam Vault stores it as metadata only and does not trust it for timing."
        >
          <Input name="external_schedule_ref" placeholder="adaptive-calendar:math:week-18" />
        </Field>
        <Field
          label="Assessment kind"
          description="Controls how the paper is categorized in dashboards. It does not weaken timing, content release, or upload rules."
        >
          <select name="assessment_kind" className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3">
            <option value="practice_paper">practice_paper</option>
            <option value="quiz">quiz</option>
            <option value="test">test</option>
            <option value="exam">exam</option>
          </select>
        </Field>
        <Field
          label="Source kind"
          description="Choose JSON for a ready normalized package, LaTeX for deterministic question detection plus AI repair, or PDF for hosted MinerU/OCR draft parsing."
        >
          <select
            name="source_kind"
            className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3"
            value={sourceKind}
            onChange={(event) => setSourceKind(event.target.value)}
          >
            <option value="json">json</option>
            <option value="latex">latex</option>
            <option value="pdf">pdf</option>
          </select>
        </Field>
        {sourceKind === "pdf" ? (
          <Field
            label="PDF source file"
            description={`Choose the original assessment PDF. It is uploaded through an Edge Function into the private assessment-sources bucket; no public PDF URL is created. Maximum ${uploadSizeLabel()}.`}
          >
            <Input name="pdf_source" type="file" accept="application/pdf,.pdf" required />
          </Field>
        ) : null}
      </div>
      {sourceKind !== "pdf" ? (
        <Field
          label="LaTeX or JSON source"
          description="Paste a normalized JSON package or LaTeX source. JSON is schema-validated; LaTeX is parsed conservatively and must be reviewed before publish."
        >
          <Textarea name="source_text" placeholder="Paste LaTeX or normalized JSON package here." required />
        </Field>
      ) : null}
      {sourceKind === "json" ? (
        <Link className="text-sm font-semibold text-[var(--primary)]" href="/templates/normalized-assessment.json">
          Download normalized JSON template
        </Link>
      ) : null}
      {sourceKind === "pdf" ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">
          PDF parsing queues a hosted MinerU job after the private upload is stored. Submit and poll the job from the
          review screen. Parsed output remains review-required before publish.
        </div>
      ) : null}
      <Button className="justify-self-start" type="submit" disabled={isSubmitting}>
        Create draft version
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
      {created ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
          <p className="font-semibold">Draft version created with parse confidence {Math.round(created.parse_confidence * 100)}%.</p>
          <Link className="mt-2 inline-block font-semibold text-[var(--primary)]" href={`/owner/assessments/${created.assessment_id}/review`}>
            Review question tree
          </Link>
        </div>
      ) : null}
    </form>
  );
}

async function readPdfUpload(file: File) {
  const validation = validatePdfUpload(file);
  if (!validation.ok) throw new Error(validation.error ?? "The selected PDF cannot be uploaded.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the selected PDF."));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) throw new Error("Could not encode the selected PDF.");
  return {
    base64,
    filename: file.name,
    contentType: file.type || "application/pdf",
  };
}
