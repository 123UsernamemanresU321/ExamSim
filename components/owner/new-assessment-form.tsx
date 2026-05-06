"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
      const body = {
        title: String(form.get("title") ?? ""),
        paper_code: String(form.get("paper_code") ?? "") || undefined,
        external_schedule_ref: String(form.get("external_schedule_ref") ?? "") || undefined,
        assessment_kind: String(form.get("assessment_kind") ?? "exam"),
        source_kind: sourceKind,
        latex_source: sourceKind === "latex" ? sourceText : undefined,
        json_package: sourceKind === "json" ? parseJsonPackage(sourceText) : undefined,
        uploaded_source_path: sourceKind === "pdf" ? String(form.get("uploaded_source_path") ?? "") : undefined,
      };

      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke<IngestResult>("ingest-assessment", { body });
      if (error) throw error;
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
        <Field label="Title">
          <Input name="title" placeholder="Olympiad Mock Paper 1" required />
        </Field>
        <Field label="Paper code">
          <Input name="paper_code" placeholder="MATH-MOCK-01" />
        </Field>
        <Field label="External schedule ref">
          <Input name="external_schedule_ref" placeholder="adaptive-calendar:math:week-18" />
        </Field>
        <Field label="Assessment kind">
          <select name="assessment_kind" className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3">
            <option value="practice_paper">practice_paper</option>
            <option value="quiz">quiz</option>
            <option value="test">test</option>
            <option value="exam">exam</option>
          </select>
        </Field>
        <Field label="Source kind">
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
          <Field label="Uploaded source path" description="Path in the private assessment-sources bucket.">
            <Input name="uploaded_source_path" placeholder="owner/{assessment}/source.pdf" />
          </Field>
        ) : null}
      </div>
      {sourceKind !== "pdf" ? (
        <Field label="LaTeX or JSON source" description="JSON is validated by the Edge Function. LaTeX uses deterministic MVP parsing.">
          <Textarea name="source_text" placeholder="Paste LaTeX or normalized JSON package here." required />
        </Field>
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
