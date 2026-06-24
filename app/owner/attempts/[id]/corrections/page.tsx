import { redirect } from "next/navigation";
import { getCorrectionNotebookWorkspace } from "@/lib/usability-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import type { CorrectionEntry } from "@/types/database";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { assertInstitutionAttemptAccess } from "@/lib/examsim/institution-resource-access";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";

async function reviewCorrections(formData: FormData) {
  "use server";
  const { ownerProfileId } = await requireInstitutionPermission("marking");
  const attemptId = String(formData.get("attempt_id") ?? "");
  const notebookId = String(formData.get("notebook_id") ?? "");
  const supabase = await createSupabaseServerClient();
  await assertInstitutionAttemptAccess(supabase, attemptId, ownerProfileId);
  const { data: notebook, error: notebookAccessError } = await supabase
    .from("correction_notebooks")
    .select("id")
    .eq("id", notebookId)
    .eq("attempt_id", attemptId)
    .maybeSingle();
  if (notebookAccessError) throw notebookAccessError;
  if (!notebook) throw new Error("Correction notebook not found for this attempt.");
  const { data: entries, error: entryError } = await supabase.from("correction_entries").select("id").eq("notebook_id", notebookId);
  if (entryError) throw entryError;
  for (const entry of entries ?? []) {
    const ownerFeedback = String(formData.get(`owner_feedback_${entry.id}`) ?? "");
    const { error } = await supabase.from("correction_entries").update({ owner_feedback: ownerFeedback, status: "reviewed" }).eq("id", entry.id);
    if (error) throw error;
  }
  const { error: notebookError } = await supabase.from("correction_notebooks").update({ status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", notebookId);
  if (notebookError) throw notebookError;
  await auditInstitutionAction({
    ownerProfileId,
    action: "correction_notebook.reviewed",
    targetTable: "correction_notebooks",
    targetId: notebookId,
    metadata: { attempt_id: attemptId, entry_count: entries?.length ?? 0 },
  });
  redirect(`/owner/attempts/${attemptId}/corrections`);
}

export default async function OwnerCorrectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCorrectionNotebookWorkspace(id);

  return (
    <main className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Attempts", href: "/owner/attempts" },
          { label: `Attempt ${id.slice(0, 8).toUpperCase()}`, href: `/owner/attempts/${id}` },
          { label: "Correction Notebook" },
        ]}
      />
      <PageHeader
        eyebrow="Correction review"
        title="Student correction notebook"
        description="Review corrections without changing the original exam marks."
      />

      {!workspace.notebook ? (
        <EmptyState title="No notebook yet" description="The student has not started a correction notebook for this attempt." />
      ) : (
        <form action={reviewCorrections} className="space-y-4">
          <input type="hidden" name="attempt_id" value={id} />
          <input type="hidden" name="notebook_id" value={workspace.notebook.id} />
          <Card className="p-5">
            <p className="text-sm font-bold text-[var(--ink)]">Notebook status: {workspace.notebook.status}</p>
          </Card>
          {(workspace.entries as CorrectionEntry[]).map((entry, index) => (
            <Card key={entry.id} className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold text-[var(--ink)]">Question {index + 1}</h2>
                <Badge>{entry.status}</Badge>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Corrected solution</p>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-white p-3 text-sm leading-6">{entry.correction_text || "No correction text."}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Reflection</p>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-white p-3 text-sm leading-6">{entry.reflection_text || "No reflection text."}</p>
                </div>
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Owner response</span>
                <Textarea name={`owner_feedback_${entry.id}`} defaultValue={entry.owner_feedback ?? ""} rows={3} className="mt-1" />
              </label>
            </Card>
          ))}
          <Button type="submit">Mark correction notebook reviewed</Button>
        </form>
      )}
    </main>
  );
}
