import { redirect } from "next/navigation";
import { NotebookPen, CheckCircle, Save, MessageSquare } from "lucide-react";
import { buildMarkingTree, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCorrectionNotebookWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { CorrectionEntry } from "@/types/database";

async function createNotebook(formData: FormData) {
  "use server";
  const attemptId = String(formData.get("attempt_id") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data: attempt, error: attemptError } = await supabase.from("attempts").select("*").eq("id", attemptId).maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) return;
  if (!attempt.assignee_profile_id) {
    throw new Error("Correction notebooks require a linked student account.");
  }
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
  const feedback = workspace.feedback as { visible_to_student?: boolean } | null;
  const feedbackReleased = Boolean(feedback?.visible_to_student);

  return (
    <main className="mx-auto max-w-[1000px] space-y-8 pb-16">
      <PageHeader
        eyebrow="Corrections"
        title="Correction and reflection notebook"
        description="Rework released feedback and record what changed in your understanding. Corrections do not change the original exam mark."
      />

      {!feedbackReleased ? (
        <EmptyState
          title="Corrections are not available yet"
          description="Your notebook becomes available after the owner releases marks and annotated feedback for this attempt."
          action={<ButtonLink href="/student" variant="secondary">
            Return to Command Center
          </ButtonLink>}
        />
      ) : !workspace.notebook ? (
        <Card className="bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <NotebookPen className="mx-auto text-[var(--primary)]" size={36} />
          <h2 className="mt-4 text-xl font-semibold text-[var(--ink)]">Start correction notebook</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            Create one correction entry for each main question block in this attempt.
          </p>
          <form action={createNotebook} className="mt-6">
            <input type="hidden" name="attempt_id" value={id} />
            <Button type="submit" className="px-6 py-2.5 font-semibold">
              Create correction notebook
            </Button>
          </form>
        </Card>
      ) : (
        <form action={saveCorrections} className="space-y-6">
          <input type="hidden" name="attempt_id" value={id} />
          <input type="hidden" name="notebook_id" value={workspace.notebook.id} />
          
          <div className="space-y-4">
            {(workspace.entries as CorrectionEntry[]).map((entry, index) => {
              const isSubmitted = entry.status === "submitted";
              return (
                <Card key={entry.id} className="overflow-hidden border-[var(--border)] bg-white shadow-[var(--shadow-card)]">
                  <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 font-mono text-xs font-bold text-slate-800">
                        {index + 1}
                      </span>
                      <h2 className="text-sm font-semibold text-[var(--ink)]">Question block</h2>
                    </div>
                    <Badge tone={isSubmitted ? "success" : "neutral"} className="uppercase tracking-[0.08em]">
                      {entry.status}
                    </Badge>
                  </div>
                  
                  <div className="p-5 space-y-4">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Corrected solution</span>
                      <p className="mb-1 text-xs text-[var(--muted)]">Rework the steps, calculate the correct values, or provide missing logic.</p>
                      <textarea 
                        name={`correction_${entry.id}`} 
                        placeholder="Detail your corrected proof, mathematical formulas, or textual answer partitions here..."
                        defaultValue={entry.correction_text ?? ""} 
                        rows={5} 
                        className="mt-1 w-full rounded-md border border-[var(--border)] p-3 text-sm shadow-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/15" 
                      />
                    </label>
                    
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Reflection</span>
                      <p className="mb-1 text-xs text-[var(--muted)]">What went wrong, and what should you remember next time?</p>
                      <textarea 
                        name={`reflection_${entry.id}`} 
                        placeholder="e.g. I lost 2 marks due to a silly calculation slip on step 3. Next time, I will double check the sign distribution..."
                        defaultValue={entry.reflection_text ?? ""} 
                        rows={3} 
                        className="mt-1 w-full rounded-md border border-[var(--border)] p-3 text-sm shadow-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/15" 
                      />
                    </label>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Confidence after correction</span>
                        <select 
                          name={`confidence_${entry.id}`} 
                          defaultValue={entry.confidence_after_correction ?? ""} 
                          className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none"
                        >
                          <option value="">Select confidence rating</option>
                          <option value="5">5 - Highly confident</option>
                          <option value="4">4 - Good understanding</option>
                          <option value="3">3 - Satisfactory</option>
                          <option value="2">2 - Weak understanding</option>
                          <option value="1">1 - Retake needed</option>
                        </select>
                      </label>
                    </div>

                    {entry.owner_feedback ? (
                      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/20 p-4 text-xs text-emerald-950 flex items-start gap-2.5">
                        <MessageSquare className="text-emerald-700 mt-0.5 flex-shrink-0" size={16} />
                        <div>
                          <p className="font-bold">Owner feedback</p>
                          <p className="mt-1 leading-relaxed opacity-90">{entry.owner_feedback}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-dashed border-[var(--border)] pt-6">
            <Button 
              type="submit" 
              name="intent" 
              value="save" 
              variant="secondary"
              className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.1em]"
            >
              <Save size={14} />
              Save Progress Draft
            </Button>
            <Button 
              type="submit" 
              name="intent" 
              value="submit"
              className="flex items-center gap-1.5 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.1em]"
            >
              <CheckCircle size={14} />
              Lock & Submit Correction Notebook
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
