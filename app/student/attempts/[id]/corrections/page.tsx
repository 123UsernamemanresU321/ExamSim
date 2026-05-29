import { redirect } from "next/navigation";
import { NotebookPen, CheckCircle, Save, Sparkles, BookOpen, MessageSquare } from "lucide-react";
import { buildMarkingTree, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCorrectionNotebookWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";

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
  const feedbackReleased = Boolean((workspace.feedback as any)?.visible_to_student);

  return (
    <main className="max-w-[1000px] mx-auto space-y-8 p-6 md:p-10 pb-16">
      
      {/* Title & Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-slate-900 to-indigo-950 p-6 md:p-8 text-white shadow-lg">
        <div className="absolute top-0 right-0 h-full w-1/3 opacity-10 bg-radial-gradient from-white to-transparent" />
        <div className="flex items-center gap-3">
          <BookOpen className="text-blue-400" size={28} />
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-300">Continuous Mastery</span>
        </div>
        <h1 className="mt-2 text-2xl font-black md:text-3xl tracking-tight text-white">Correction & Reflective Notebook</h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-300 max-w-2xl">
          Corrections are powerful learning evidence. Reworking incorrect steps and summarizing insights drives cognitive growth. Original exam scores are untouched.
        </p>
      </div>

      {!feedbackReleased ? (
        <Card className="border-amber-100 bg-amber-50/20 p-8 shadow-sm flex flex-col items-center text-center">
          <Sparkles className="text-amber-500 animate-spin" size={32} />
          <h2 className="mt-4 font-black text-slate-900 text-lg">Correction Ledger Under Assembly</h2>
          <p className="mt-2 text-xs text-[var(--muted)] max-w-md leading-relaxed">
            Your notebook will automatically build once the assessment coordinator publishes the official cohort marks and annotated feedback.
          </p>
          <ButtonLink href="/student" variant="secondary" className="mt-5 text-xs font-semibold">
            Return to Command Center
          </ButtonLink>
        </Card>
      ) : !workspace.notebook ? (
        <Card className="border-[#dde3ee] p-10 text-center shadow-md bg-white">
          <NotebookPen className="mx-auto text-indigo-600 animate-bounce" size={48} />
          <h2 className="mt-5 text-xl font-bold text-slate-900">Start Your Reflective Rework</h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-[var(--muted)] leading-relaxed">
            Generate your personalized correction directory. We will allocate one dedicated reworking module for each core question block.
          </p>
          <form action={createNotebook} className="mt-6">
            <input type="hidden" name="attempt_id" value={id} />
            <Button type="submit" className="px-6 py-2.5 font-bold shadow-md bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all">
              Initialize Correction Notebook
            </Button>
          </form>
        </Card>
      ) : (
        <form action={saveCorrections} className="space-y-6">
          <input type="hidden" name="attempt_id" value={id} />
          <input type="hidden" name="notebook_id" value={workspace.notebook.id} />
          
          <div className="space-y-4">
            {workspace.entries.map((entry: any, index) => {
              const isSubmitted = entry.status === "submitted";
              return (
                <Card key={entry.id} className="border-[#dde3ee] shadow-sm overflow-hidden bg-white hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between border-b border-[#dde3ee] bg-slate-50/50 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 font-mono text-xs font-bold text-slate-800">
                        {index + 1}
                      </span>
                      <h2 className="font-bold text-slate-900 text-sm">Question Block Partition</h2>
                    </div>
                    <Badge tone={isSubmitted ? "success" : "neutral"} className="text-[10px] uppercase font-bold tracking-wider">
                      {entry.status}
                    </Badge>
                  </div>
                  
                  <div className="p-5 space-y-4">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtle)]">Corrected Math / Solution Steps</span>
                      <p className="text-[11px] text-[var(--muted)] mb-1">Rework the steps, calculate the correct values, or provide missing logic:</p>
                      <textarea 
                        name={`correction_${entry.id}`} 
                        placeholder="Detail your corrected proof, mathematical formulas, or textual answer partitions here..."
                        defaultValue={entry.correction_text ?? ""} 
                        rows={5} 
                        className="mt-1 w-full rounded-lg border border-[#dde3ee] p-3 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono" 
                      />
                    </label>
                    
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtle)]">Self-Reflection & Takeaways</span>
                      <p className="text-[11px] text-[var(--muted)] mb-1">What cognitive error occurred? (e.g. calculation slip, misread prompt, missing theorem):</p>
                      <textarea 
                        name={`reflection_${entry.id}`} 
                        placeholder="e.g. I lost 2 marks due to a silly calculation slip on step 3. Next time, I will double check the sign distribution..."
                        defaultValue={entry.reflection_text ?? ""} 
                        rows={3} 
                        className="mt-1 w-full rounded-lg border border-[#dde3ee] p-3 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" 
                      />
                    </label>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--subtle)]">Post-Correction Confidence</span>
                        <select 
                          name={`confidence_${entry.id}`} 
                          defaultValue={entry.confidence_after_correction ?? ""} 
                          className="mt-1 w-full rounded-lg border border-[#dde3ee] bg-white px-3 py-2.5 text-xs shadow-sm font-semibold text-slate-800 focus:outline-none"
                        >
                          <option value="">Select confidence rating</option>
                          <option value="5">⭐⭐⭐⭐⭐ 5 - Highly Confident</option>
                          <option value="4">⭐⭐⭐⭐ 4 - Good Understanding</option>
                          <option value="3">⭐⭐⭐ 3 - Satisfactory</option>
                          <option value="2">⭐⭐ 2 - Weak Understanding</option>
                          <option value="1">⭐ 1 - Retake Needed</option>
                        </select>
                      </label>
                    </div>

                    {entry.owner_feedback ? (
                      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/20 p-4 text-xs text-emerald-950 flex items-start gap-2.5">
                        <MessageSquare className="text-emerald-700 mt-0.5 flex-shrink-0" size={16} />
                        <div>
                          <p className="font-bold">Assigned Evaluator Commentary:</p>
                          <p className="mt-1 leading-relaxed opacity-90">{entry.owner_feedback}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-[#dde3ee] pt-6 justify-end">
            <Button 
              type="submit" 
              name="intent" 
              value="save" 
              variant="secondary"
              className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-150 active:scale-95 flex items-center gap-1.5"
            >
              <Save size={14} />
              Save Progress Draft
            </Button>
            <Button 
              type="submit" 
              name="intent" 
              value="submit"
              className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider shadow-md bg-gradient-to-r from-blue-700 to-indigo-700 text-white hover:brightness-110 transition-all duration-150 active:scale-95 flex items-center gap-1.5 border-0"
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
