"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function QtiImportForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("qti_zip");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("Choose a QTI ZIP file.");
      return;
    }
    setIsSubmitting(true);
    setMessage("Importing QTI package...");
    const qtiZipBase64 = await fileToBase64(file);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke<{ assessment_id: string; question_count: number }>("qti-import-assessment", {
      body: {
        title: String(form.get("title") ?? ""),
        paper_code: String(form.get("paper_code") ?? "") || undefined,
        assessment_kind: String(form.get("assessment_kind") ?? "exam"),
        qti_zip_base64: qtiZipBase64,
      },
    });
    setIsSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`QTI imported with ${data?.question_count ?? 0} item(s). Review is required before publish.`);
    router.refresh();
    if (data?.assessment_id) router.push(`/owner/assessments/${data.assessment_id}/review`);
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="QTI title">
          <Input name="title" placeholder="Imported QTI assessment" required />
        </Field>
        <Field label="Paper code">
          <Input name="paper_code" placeholder="QTI-PAPER-01" />
        </Field>
        <Field label="Assessment kind">
          <select name="assessment_kind" className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3">
            <option value="practice_paper">practice_paper</option>
            <option value="quiz">quiz</option>
            <option value="test">test</option>
            <option value="exam">exam</option>
          </select>
        </Field>
        <Field label="QTI ZIP">
          <Input name="qti_zip" type="file" accept=".zip,application/zip" required />
        </Field>
      </div>
      <Button className="justify-self-start" type="submit" variant="secondary" disabled={isSubmitting}>
        <FileArchive size={16} aria-hidden="true" />
        Import QTI ZIP
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
