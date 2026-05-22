import { redirect } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { buildMarkingTree, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCorrectionNotebookWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function createNotebook(formData: FormData) {
  "use server";
  const attemptId = String(formData.get("attempt_id") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data: attempt, error: attemptError } = await supabase.from("attempts").select("*").eq("id", attemptId).maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) return;
  const { data: notebook, error: notebookError } = await supabase
    .from("correction_notebooks")
    .insert({ attempt_id: attemptId, student_profile_id: attempt.assignee_profile_id, status: "in_progress" })
    .select("*")
    .single();
  if (notebookError) throw notebookError;
  const { data: nodes, error: nodeError } = await supabase.from("question_nodes").select("*").eq("assessment_version_id", attempt.assessment_version_id).order("ordinal");
  if (nodeError) throw nodeError;
  const roots = getSelectableMarkingGroups(buildMarkingTree(nodes ?? []));
  if (roots.length) {
    const { error: entryError } = await supabase.from("correction_entries").insert(
      roots.map((root) => ({
        notebook_id: notebook.id,
        question_node_id: root.id,
        root_question_node_id: root.id,
      })),
    );
    if (entryError) throw entryError;
  }
  redirect(`/student/attempts/${attemptId}/corrections`);
}

async function saveCorrections(formData: FormData) {
  "use server";
  const attemptId = String(formData.get("attempt_id") ?? "");
  const notebookId = String(formData.get("notebook_id") ?? "");
  const submit = formData.get("intent") === "submit";
  const supabase = await createSupabaseServerClient();
  const { data: entries, error: entryError } = await supabase.from("correction_entries").select("id").eq("notebook_id", notebookId);
  if (entryError) throw entryError;
  for (const entry of entries ?? []) {
    const correction = String(formData.get(`correction_${entry.id}`) ?? "");
    const reflection = String(formData.get(`reflection_${entry.id}`) ?? "");
    const confidenceRaw = Number(formData.get(`confidence_${entry.id}`) ?? 0);
    const { error } = await supabase
      .from("correction_entries")
      .update({
        correction_text: correction,
        reflection_text: reflection,
        confidence_after_correction: confidenceRaw || null,
        status: submit ? "submitted" : "draft",
      })
      .eq("id", entry.id);
    if (error) throw error;
  }
  const { error: notebookError } = await supabase
    .from("correction_notebooks")
    .update({ status: submit ? "submitted" : "in_progress", submitted_at: submit ? new Date().toISOString() : null })
    .eq("id", notebookId);
  if (notebookError) throw notebookError;
  redirect(`/student/attempts/${attemptId}/corrections`);
}

export default async function StudentCorrectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCorrectionNotebookWorkspace(id);
  const feedbackReleased = Boolean(workspace.feedback?.visible_to_student);

  return (
    <main className="space-y-6 p-6 md:p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">Correction Notebook</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--ink)]">Correct and reflect</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Corrections are learning records. They do not change the original exam mark.
        </p>
      </div>

      {!feedbackReleased ? (
        <Card className="p-8">
          <h2 className="font-black text-[var(--ink)]">Feedback has not been released yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Your correction notebook opens after the owner releases feedback.</p>
        </Card>
      ) : !workspace.notebook ? (
        <Card className="p-8 text-center">
          <NotebookPen className="mx-auto text-[var(--primary)]" size={42} />
          <h2 className="mt-4 text-xl font-black text-[var(--ink)]">Start your correction notebook</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--muted)]">You will get one correction entry per main question.</p>
          <form action={createNotebook} className="mt-5">
            <input type="hidden" name="attempt_id" value={id} />
            <Button type="submit">Start correction notebook</Button>
          </form>
        </Card>
      ) : (
        <form action={saveCorrections} className="space-y-4">
          <input type="hidden" name="attempt_id" value={id} />
          <input type="hidden" name="notebook_id" value={workspace.notebook.id} />
          {workspace.entries.map((entry, index) => (
            <Card key={entry.id} className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-black text-[var(--ink)]">Question {index + 1}</h2>
                <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-black text-[var(--muted)]">{entry.status}</span>
              </div>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Corrected solution</span>
                <textarea name={`correction_${entry.id}`} defaultValue={entry.correction_text ?? ""} rows={5} className="mt-1 w-full rounded-lg border border-[var(--border)] p-3" />
              </label>
              <label className="mt-4 block">
                <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Reflection</span>
                <textarea name={`reflection_${entry.id}`} defaultValue={entry.reflection_text ?? ""} rows={3} className="mt-1 w-full rounded-lg border border-[var(--border)] p-3" />
              </label>
              <label className="mt-4 block max-w-xs">
                <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Confidence after correction</span>
                <input name={`confidence_${entry.id}`} type="number" min="1" max="5" defaultValue={entry.confidence_after_correction ?? ""} className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" />
              </label>
              {entry.owner_feedback ? <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-900">{entry.owner_feedback}</p> : null}
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="save" variant="secondary">Save draft</Button>
            <Button type="submit" name="intent" value="submit">Submit correction notebook</Button>
          </div>
        </form>
      )}
    </main>
  );
}
