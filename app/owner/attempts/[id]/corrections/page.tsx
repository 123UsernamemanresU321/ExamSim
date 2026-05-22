import { redirect } from "next/navigation";
import { getCorrectionNotebookWorkspace } from "@/lib/usability-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function reviewCorrections(formData: FormData) {
  "use server";
  const attemptId = String(formData.get("attempt_id") ?? "");
  const notebookId = String(formData.get("notebook_id") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data: entries, error: entryError } = await supabase.from("correction_entries").select("id").eq("notebook_id", notebookId);
  if (entryError) throw entryError;
  for (const entry of entries ?? []) {
    const ownerFeedback = String(formData.get(`owner_feedback_${entry.id}`) ?? "");
    const { error } = await supabase.from("correction_entries").update({ owner_feedback: ownerFeedback, status: "reviewed" }).eq("id", entry.id);
    if (error) throw error;
  }
  const { error: notebookError } = await supabase.from("correction_notebooks").update({ status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", notebookId);
  if (notebookError) throw notebookError;
  redirect(`/owner/attempts/${attemptId}/corrections`);
}

export default async function OwnerCorrectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCorrectionNotebookWorkspace(id);

  return (
    <main className="space-y-6 p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">Correction Review</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--ink)]">Student correction notebook</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Review corrections without changing the original exam marks.</p>
      </div>

      {!workspace.notebook ? (
        <Card className="p-8">
          <h2 className="font-black text-[var(--ink)]">No notebook yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">The student has not started a correction notebook for this attempt.</p>
        </Card>
      ) : (
        <form action={reviewCorrections} className="space-y-4">
          <input type="hidden" name="attempt_id" value={id} />
          <input type="hidden" name="notebook_id" value={workspace.notebook.id} />
          <Card className="p-5">
            <p className="text-sm font-bold text-[var(--ink)]">Notebook status: {workspace.notebook.status}</p>
          </Card>
          {workspace.entries.map((entry, index) => (
            <Card key={entry.id} className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-black text-[var(--ink)]">Question {index + 1}</h2>
                <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-black text-[var(--muted)]">{entry.status}</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Corrected solution</p>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-white p-3 text-sm leading-6">{entry.correction_text || "No correction text."}</p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Reflection</p>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-white p-3 text-sm leading-6">{entry.reflection_text || "No reflection text."}</p>
                </div>
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Owner response</span>
                <textarea name={`owner_feedback_${entry.id}`} defaultValue={entry.owner_feedback ?? ""} rows={3} className="mt-1 w-full rounded-lg border border-[var(--border)] p-3" />
              </label>
            </Card>
          ))}
          <Button type="submit">Mark correction notebook reviewed</Button>
        </form>
      )}
    </main>
  );
}
