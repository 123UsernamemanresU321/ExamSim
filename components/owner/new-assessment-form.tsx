"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { SUBJECT_PRESETS } from "@/lib/subjects";
import { uploadSizeLabel, validatePdfUpload } from "@/lib/upload-policy";
import type { AssessmentTemplate } from "@/types/database";

type IngestResult = {
  assessment_id: string;
  draft_version_id: string;
  parse_confidence: number;
  requires_owner_review: boolean;
  parse_job_id?: string | null;
  markscheme_parse_job_id?: string | null;
};

function parseJsonPackage(raw: string) {
  if (!raw.trim()) return undefined;
  return JSON.parse(raw) as Record<string, unknown>;
}

export function NewAssessmentForm({ templates = [] }: { templates?: AssessmentTemplate[] }) {
  const router = useRouter();
  const [sourceKind, setSourceKind] = useState("json");
  const [markschemeKind, setMarkschemeKind] = useState("none");
  const [assessmentKind, setAssessmentKind] = useState("exam");
  const [subject, setSubject] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
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
      const markschemeText = String(form.get("markscheme_text") ?? "");
      const markschemePdfFile = form.get("markscheme_pdf_source");
      const markschemePdfPayload = markschemeKind === "pdf" && markschemePdfFile instanceof File && markschemePdfFile.size > 0
        ? await readPdfUpload(markschemePdfFile)
        : null;
      if (sourceKind === "pdf" && !pdfPayload) {
        throw new Error("Choose a PDF file to upload.");
      }
      if (markschemeKind === "pdf" && !markschemePdfPayload) {
        throw new Error("Choose a markscheme PDF file to upload.");
      }
      const body = {
        title: String(form.get("title") ?? ""),
        paper_code: String(form.get("paper_code") ?? "") || undefined,
        subject: String(form.get("subject") ?? "") || undefined,
        external_schedule_ref: String(form.get("external_schedule_ref") ?? "") || undefined,
        assessment_kind: assessmentKind,
        source_kind: sourceKind,
        latex_source: sourceKind === "latex" ? sourceText : undefined,
        json_package: sourceKind === "json" ? parseJsonPackage(sourceText) : undefined,
        pdf_source_base64: pdfPayload?.base64,
        pdf_source_filename: pdfPayload?.filename,
        pdf_source_content_type: pdfPayload?.contentType,
        markscheme_source_kind: markschemeKind === "none" ? undefined : markschemeKind,
        markscheme_latex_source: markschemeKind === "latex" ? markschemeText : undefined,
        markscheme_json: markschemeKind === "json" ? parseJsonPackage(markschemeText) : undefined,
        markscheme_pdf_base64: markschemePdfPayload?.base64,
        markscheme_pdf_filename: markschemePdfPayload?.filename,
        markscheme_pdf_content_type: markschemePdfPayload?.contentType,
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
      {templates.length > 0 ? (
        <Field
          label="Assessment template"
          description="Optional. Select a saved policy preset so the assessment kind matches the publish settings you will apply later."
        >
          <Select
            value={selectedTemplateId}
            onChange={(event) => {
              setSelectedTemplateId(event.target.value);
              const template = templates.find((item) => item.id === event.target.value);
              if (template) setAssessmentKind(template.assessment_kind);
            }}
          >
            <option value="">Start blank</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
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
          label="Subject"
          description="Used for question-bank extraction, topic analysis, and paper generation filters. The extracted questions inherit this subject."
        >
          <input type="hidden" name="subject" value={subject} />
          <div className="flex flex-wrap gap-2">
            {SUBJECT_PRESETS.map((subjectName) => (
              <button
                key={subjectName}
                type="button"
                className={`rounded-[2px] border px-3 py-2 text-xs font-semibold transition-colors ${
                  subject === subjectName
                    ? "border-[var(--primary)] bg-[var(--primary)] !text-white"
                    : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--primary)]"
                }`}
                onClick={() => setSubject(subjectName)}
              >
                {subjectName}
              </button>
            ))}
          </div>
          <Input
            className="mt-2"
            placeholder="Custom subject, if needed"
            value={subject && !SUBJECT_PRESETS.includes(subject as (typeof SUBJECT_PRESETS)[number]) ? subject : ""}
            onChange={(event) => setSubject(event.target.value)}
          />
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
          <Select
            name="assessment_kind"
            value={assessmentKind}
            onChange={(event) => setAssessmentKind(event.target.value)}
          >
            <option value="practice_paper">practice_paper</option>
            <option value="quiz">quiz</option>
            <option value="test">test</option>
            <option value="exam">exam</option>
          </Select>
        </Field>
        <Field
          label="Source kind"
          description="Choose JSON for a ready normalized package, LaTeX for deterministic question detection plus AI repair, or PDF for hosted MinerU/OCR draft parsing."
        >
          <Select
            name="source_kind"
            value={sourceKind}
            onChange={(event) => setSourceKind(event.target.value)}
          >
            <option value="json">json</option>
            <option value="latex">latex</option>
            <option value="pdf">pdf</option>
          </Select>
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
        <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">
          PDF parsing queues a hosted MinerU job after the private upload is stored. Submit and poll the job from the
          review screen. Parsed output remains review-required before publish.
        </div>
      ) : null}
      <section className="grid gap-4 rounded-[4px] border border-[var(--border)] bg-white p-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)]">Optional markscheme source</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Add a markscheme now if you have it. PDF markschemes queue a separate hosted MinerU job; JSON and LaTeX are
            stored privately and passed to DeepSeek as marking evidence. AI suggestions remain review-required.
          </p>
        </div>
        <Field
          label="Markscheme source kind"
          description="Choose none if you only have the question paper. Choose PDF, LaTeX, or JSON when you want DeepSeek to infer per-part marks and marking guidance from the markscheme."
        >
          <Select
            name="markscheme_source_kind"
            value={markschemeKind}
            onChange={(event) => setMarkschemeKind(event.target.value)}
          >
            <option value="none">none</option>
            <option value="json">json</option>
            <option value="latex">latex</option>
            <option value="pdf">pdf</option>
          </Select>
        </Field>
        {markschemeKind === "pdf" ? (
          <Field
            label="Markscheme PDF file"
            description={`Choose the official markscheme PDF. It is stored privately and parsed separately from the question paper. Maximum ${uploadSizeLabel()}.`}
          >
            <Input name="markscheme_pdf_source" type="file" accept="application/pdf,.pdf" required />
          </Field>
        ) : null}
        {markschemeKind === "latex" || markschemeKind === "json" ? (
          <Field
            label={markschemeKind === "json" ? "Markscheme JSON" : "Markscheme LaTeX"}
            description={
              markschemeKind === "json"
                ? "Paste a JSON markscheme with matching node_key values where possible. Marks and markscheme_html will be merged into the review draft."
                : "Paste the LaTeX markscheme or memo. DeepSeek will use it to suggest exact part marks and per-question marking guidance."
            }
          >
            <Textarea
              name="markscheme_text"
              placeholder={markschemeKind === "json" ? "Paste markscheme JSON here." : "Paste markscheme LaTeX here."}
              required
            />
          </Field>
        ) : null}
      </section>
      <Button className="justify-self-start" type="submit" disabled={isSubmitting}>
        Create draft version
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
      {created ? (
        <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
          <p className="font-semibold">Draft version created with parse confidence {Math.round(created.parse_confidence * 100)}%.</p>
          {"markscheme_parse_job_id" in created && created.markscheme_parse_job_id ? (
            <p className="mt-1 text-[var(--muted)]">A separate markscheme MinerU job was queued for review.</p>
          ) : null}
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
