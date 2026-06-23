"use client";

import { useState, useTransition } from "react";
import { Archive, FileUp, RefreshCw } from "lucide-react";
import { archiveResourceLibraryItemAction } from "@/app/owner/resources/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/status-badge";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ResourceLibraryItem } from "@/types/database";

type IssueResponse = {
  bucket: "assessment-resources";
  object_path: string;
  upload_token: string;
  max_file_size_bytes: number;
};

type ConfirmResponse = {
  ok: boolean;
  duplicate?: boolean;
  idempotent?: boolean;
  resource: Pick<ResourceLibraryItem, "id" | "title" | "material_type" | "subject" | "level" | "version_label" | "language_code" | "file_size_bytes" | "page_count" | "status">;
};

export function ResourceLibraryManager({
  resources,
  usageCounts,
}: {
  resources: ResourceLibraryItem[];
  usageCounts: Record<string, number>;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function uploadResource(formData: FormData) {
    const selected = formData.get("resource_pdf");
    const file = selected instanceof File ? selected : null;
    setMessage(null);
    setError(null);
    if (!file) {
      setError("Choose a PDF resource first.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Resource files must be PDFs.");
      return;
    }
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const issued = await invokeEdgeFunction<IssueResponse>(supabase, "owner-issue-resource-upload", {
          body: {},
          requiresAal2: true,
        });
        if (!issued) throw new Error("The private resource upload slot was not returned.");
        if (file.size > issued.max_file_size_bytes) throw new Error("This PDF exceeds the 50 MB resource limit.");
        const { error: uploadError } = await supabase.storage
          .from(issued.bucket)
          .uploadToSignedUrl(issued.object_path, issued.upload_token, file, { contentType: "application/pdf" });
        if (uploadError) throw uploadError;
        const confirmed = await invokeEdgeFunction<ConfirmResponse>(supabase, "owner-confirm-resource-upload", {
          body: {
            object_path: issued.object_path,
            title: String(formData.get("title") ?? ""),
            material_type: String(formData.get("material_type") ?? "reference"),
            subject: String(formData.get("subject") ?? ""),
            level: String(formData.get("level") ?? ""),
            version_label: String(formData.get("version_label") ?? ""),
            language_code: String(formData.get("language_code") ?? "en"),
            replaces_resource_id: String(formData.get("replaces_resource_id") ?? ""),
          },
          requiresAal2: true,
        });
        if (!confirmed?.resource) throw new Error("The uploaded resource could not be confirmed.");
        setMessage(confirmed.duplicate
          ? `This PDF already exists as ${confirmed.resource.title}; the duplicate upload was removed.`
          : `${confirmed.resource.title} was added to the private resource library.`);
        window.location.reload();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Resource upload failed.");
      }
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <div className="mb-5">
          <h2 className="text-base font-semibold text-[var(--ink)]">Upload a reusable PDF</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Files stay private. The server checks PDF bytes, size, ownership, and SHA-256 before creating a library version.</p>
        </div>
        <form action={uploadResource} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="PDF file" description="Choose an authorized formula, data, reference, annex, or instruction booklet.">
              <Input name="resource_pdf" type="file" accept="application/pdf,.pdf" required />
            </Field>
            <Field label="Resource title" description="Use the official title plus edition where useful.">
              <Input name="title" placeholder="Mathematics AA HL formula booklet" maxLength={180} required />
            </Field>
            <Field label="Resource type">
              <Select name="material_type" defaultValue="formula_booklet">
                <option value="formula_booklet">Formula booklet</option>
                <option value="data_booklet">Data booklet</option>
                <option value="annex">Annex</option>
                <option value="instructions">Instructions</option>
                <option value="reference">Reference</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Version" description="Edition or revision label shown to teachers.">
              <Input name="version_label" placeholder="2025 v1.2" maxLength={80} />
            </Field>
            <Field label="Subject"><Input name="subject" placeholder="IB Mathematics AA" maxLength={100} /></Field>
            <Field label="Level"><Input name="level" placeholder="Higher Level" maxLength={80} /></Field>
            <Field label="Language"><Input name="language_code" defaultValue="en" maxLength={12} /></Field>
            <Field label="Replace an older version" description="The older item remains in history but becomes unavailable for new assignments.">
              <Select name="replaces_resource_id" defaultValue="">
                <option value="">Do not replace</option>
                {resources.filter((resource) => resource.status === "active").map((resource) => (
                  <option key={resource.id} value={resource.id}>{resource.title}{resource.version_label ? ` (${resource.version_label})` : ""}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
            <Button type="submit" isLoading={isPending}><FileUp size={15} aria-hidden="true" />Upload and verify</Button>
            <p className="text-xs text-[var(--muted)]">Maximum 50 MB. PDF only. Duplicate file content is detected before a second item is created.</p>
          </div>
          {message ? <p role="status" className="rounded-[3px] border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p> : null}
          {error ? <p role="alert" className="rounded-[3px] border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p> : null}
        </form>
      </Card>

      <section aria-labelledby="resource-list-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 id="resource-list-heading" className="text-base font-semibold text-[var(--ink)]">Library items</h2><p className="mt-1 text-sm text-[var(--muted)]">Assign active versions from an assessment&apos;s Materials and tools settings.</p></div>
          <span className="text-xs font-semibold text-[var(--muted)]">{resources.length} version{resources.length === 1 ? "" : "s"}</span>
        </div>
        {resources.length ? (
          <div className="grid gap-3">
            {resources.map((resource) => (
              <article key={resource.id} className="grid gap-4 rounded-[4px] border border-[var(--border)] bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[var(--ink)]">{resource.title}</h3><StatusBadge status={resource.status} /></div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{resource.material_type.replaceAll("_", " ")}{resource.subject ? ` · ${resource.subject}` : ""}{resource.level ? ` · ${resource.level}` : ""}{resource.version_label ? ` · ${resource.version_label}` : ""}</p>
                  <p className="mt-2 text-xs text-[var(--subtle)]">{resource.page_count ?? "Unknown"} pages · {(resource.file_size_bytes / 1024 / 1024).toFixed(2)} MB · used by {usageCounts[resource.id] ?? 0} assessment version(s)</p>
                </div>
                {resource.status === "active" ? (
                  <form action={archiveResourceLibraryItemAction}>
                    <input type="hidden" name="resource_id" value={resource.id} />
                    <Button type="submit" variant="dangerSubtle"><Archive size={14} aria-hidden="true" />Archive</Button>
                  </form>
                ) : <span className="inline-flex items-center gap-2 text-xs text-[var(--muted)]"><RefreshCw size={14} aria-hidden="true" />Historical version</span>}
              </article>
            ))}
          </div>
        ) : <EmptyState title="No private resources yet" description="Upload an authorized PDF booklet here, then assign it to an assessment as Required or Allowed." />}
      </section>
    </div>
  );
}
