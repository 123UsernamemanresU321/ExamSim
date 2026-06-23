"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, FileUp, XCircle } from "lucide-react";
import { createCurriculumStandardAction, reviewCurriculumStandardsAction } from "@/app/owner/standards/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/status-badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { CurriculumFramework, CurriculumSourceDocument, CurriculumStandard } from "@/types/database";

type UploadIssue = { bucket: "curriculum-sources"; object_path: string; upload_token: string; max_file_size_bytes: number };
type UploadConfirm = { ok: boolean; duplicate?: boolean; source: Pick<CurriculumSourceDocument, "id" | "title" | "status"> };

export function CurriculumGuideReviewPanel({
  sources,
  draftStandards,
  frameworks,
}: {
  sources: CurriculumSourceDocument[];
  draftStandards: CurriculumStandard[];
  frameworks: CurriculumFramework[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function uploadGuide(formData: FormData) {
    const selected = formData.get("guide_pdf");
    const file = selected instanceof File ? selected : null;
    if (!file) return setError("Choose an authorized PDF subject guide.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setError("Curriculum sources must be PDFs.");
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const issued = await invokeEdgeFunction<UploadIssue>(supabase, "owner-issue-curriculum-source-upload", { body: {}, requiresAal2: true });
        if (!issued) throw new Error("The private guide upload slot was not returned.");
        if (file.size > issued.max_file_size_bytes) throw new Error("This guide exceeds the 50 MB limit.");
        const { error: uploadError } = await supabase.storage.from(issued.bucket).uploadToSignedUrl(issued.object_path, issued.upload_token, file, { contentType: "application/pdf" });
        if (uploadError) throw uploadError;
        const confirmed = await invokeEdgeFunction<UploadConfirm>(supabase, "owner-confirm-curriculum-source-upload", {
          body: {
            object_path: issued.object_path,
            title: String(formData.get("title") ?? ""),
            subject: String(formData.get("subject") ?? ""),
            programme_component: String(formData.get("programme_component") ?? "subject"),
            version_label: String(formData.get("version_label") ?? ""),
            language_code: "en",
          },
          requiresAal2: true,
        });
        if (!confirmed?.source) throw new Error("The guide could not be confirmed.");
        setMessage(confirmed.duplicate ? "That exact guide PDF is already in this workspace." : "Guide verified. Add concise nodes below, then approve them before use.");
        window.location.reload();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Guide upload failed.");
      }
    });
  }

  return <section className="grid gap-5" aria-labelledby="guide-review-heading">
    <Card>
      <h2 id="guide-review-heading" className="text-base font-semibold text-[var(--ink)]">Guide import and review</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Store authorized guides privately, then create concise topic, skill, objective, command-term, or core-requirement nodes with source pages. Long guide passages are not copied.</p>
      <form action={uploadGuide} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Guide PDF"><Input name="guide_pdf" type="file" accept="application/pdf,.pdf" required /></Field>
        <Field label="Guide title"><Input name="title" placeholder="Mathematics AA guide" required /></Field>
        <Field label="Subject"><Input name="subject" placeholder="Mathematics AA" /></Field>
        <Field label="Guide version"><Input name="version_label" placeholder="2021 update Nov 2024" /></Field>
        <Field label="Programme component"><Select name="programme_component" defaultValue="subject"><option value="subject">DP subject</option><option value="core">DP Core</option></Select></Field>
        <div className="md:col-span-2 xl:col-span-5"><Button type="submit" isLoading={pending}><FileUp size={15} aria-hidden="true" />Upload private guide</Button></div>
      </form>
      {message ? <p role="status" className="mt-4 rounded-[3px] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-[3px] border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p> : null}
    </Card>

    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <h3 className="font-semibold text-[var(--ink)]">Private guide sources</h3>
        {sources.length ? <div className="mt-4 grid gap-3">{sources.map((source) => <div key={source.id} className="rounded-[3px] border border-[var(--border)] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold text-[var(--ink)]">{source.title}</p><StatusBadge status={source.status} /></div><p className="mt-1 text-xs text-[var(--muted)]">{source.subject ?? source.programme_component} · {source.version_label ?? "version not set"} · {source.page_count ?? "?"} pages</p></div>)}</div> : <EmptyState title="No guide sources" description="Upload an authorized subject or DP Core guide to begin a reviewed import." />}
      </Card>
      <Card>
        <h3 className="font-semibold text-[var(--ink)]">Add concise draft node</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">Draft nodes do not appear in authoring, analytics, mock generation, or revision until approved.</p>
        <form action={createCurriculumStandardAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Private source guide"><Select name="source_document_id" required defaultValue=""><option value="">Select source</option>{sources.filter((source) => source.status !== "archived").map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</Select></Field>
          <Field label="Framework"><Select name="framework_id" required defaultValue=""><option value="">Select framework</option>{frameworks.filter((framework) => framework.review_status !== "archived").map((framework) => <option key={framework.id} value={framework.id}>{framework.code} · {framework.name}</option>)}</Select></Field>
          <Field label="Node kind"><Select name="standard_kind" defaultValue="topic"><option value="topic">Topic</option><option value="subtopic">Subtopic</option><option value="skill">Skill</option><option value="assessment_objective">Assessment objective</option><option value="command_term">Command term</option><option value="core_requirement">Core requirement</option></Select></Field>
          <Field label="Code"><Input name="code" placeholder="IB.DP.AA.TOPIC.1" required /></Field>
          <Field label="Title"><Input name="title" placeholder="Number and algebra" required /></Field>
          <Field label="Subject"><Input name="subject" placeholder="Mathematics AA" /></Field>
          <Field label="Level"><Input name="level" placeholder="HL" /></Field>
          <Field label="Source pages"><div className="grid grid-cols-2 gap-2"><Input name="source_page_start" type="number" min="1" placeholder="From" /><Input name="source_page_end" type="number" min="1" placeholder="To" /></div></Field>
          <Field label="Concise school wording" className="md:col-span-2"><Textarea name="description" rows={3} placeholder="A short locally reviewed summary, not a copied guide passage." /></Field>
          <Button type="submit" variant="secondary" className="md:col-span-2 md:justify-self-start">Add to review queue</Button>
        </form>
      </Card>
    </div>

    <Card>
      <h3 className="font-semibold text-[var(--ink)]">Draft review queue</h3>
      {draftStandards.length ? <form className="mt-4" action={reviewCurriculumStandardsAction.bind(null, "approved")}>
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">{draftStandards.map((standard) => <label key={standard.id} className="grid cursor-pointer gap-3 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"><input type="checkbox" name="standard_id" value={standard.id} /><div><p className="font-mono text-xs font-semibold text-[var(--primary)]">{standard.code}</p><p className="text-sm font-semibold text-[var(--ink)]">{standard.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{standard.standard_kind.replaceAll("_", " ")}{standard.description ? ` · ${standard.description}` : ""}</p></div><p className="text-xs text-[var(--muted)]">Source pages {standard.source_page_start ?? "?"}{standard.source_page_end && standard.source_page_end !== standard.source_page_start ? `-${standard.source_page_end}` : ""}</p></label>)}</div>
        <div className="mt-4 flex flex-wrap gap-3"><Button type="submit"><CheckCircle2 size={15} aria-hidden="true" />Approve selected</Button><Button type="submit" variant="dangerSubtle" formAction={reviewCurriculumStandardsAction.bind(null, "rejected")}><XCircle size={15} aria-hidden="true" />Reject selected</Button></div>
      </form> : <EmptyState title="No draft guide nodes" description="Approved nodes are available to authoring; rejected nodes remain in provenance history." />}
    </Card>
  </section>;
}
