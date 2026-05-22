import { redirect } from "next/navigation";
import { FilePlus2, Wand2 } from "lucide-react";
import { selectQuestionBankItems } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUBJECT_PRESETS } from "@/lib/subjects";
import { listPaperGeneratorWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function generatePaper(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "Generated paper").trim() || "Generated paper";
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const targetMarks = Number(formData.get("target_marks") ?? 30);
  const durationMinutes = Number(formData.get("duration_minutes") ?? 60);
  const supabase = await createSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("app_role", "owner").single();
  if (profileError) throw profileError;
  const { data: items, error: itemError } = await supabase.from("question_bank_items").select("*").eq("do_not_reuse", false);
  if (itemError) throw itemError;
  const selection = selectQuestionBankItems(items ?? [], { subject, targetMarks, includeVisualQuestions: true });
  const { data: paper, error: paperError } = await supabase
    .from("generated_papers")
    .insert({
      owner_profile_id: profile.id,
      title,
      subject,
      target_marks: targetMarks,
      target_duration_seconds: Math.max(1, durationMinutes) * 60,
      criteria_json: { subject, target_marks: targetMarks, warnings: selection.warnings },
    })
    .select("*")
    .single();
  if (paperError) throw paperError;
  if (selection.selectedItems.length) {
    const { error: itemInsertError } = await supabase.from("generated_paper_items").insert(
      selection.selectedItems.map((item, index) => ({
        generated_paper_id: paper.id,
        question_bank_item_id: item.id,
        ordinal: index + 1,
        included_marks: item.marks_available,
      })),
    );
    if (itemInsertError) throw itemInsertError;
  }
  redirect("/owner/paper-generator");
}

export default async function PaperGeneratorPage() {
  const { questionBankItems, generatedPapers, generatedPaperItems } = await listPaperGeneratorWorkspace();
  const itemsByPaper = new Map<string, number>();
  for (const item of generatedPaperItems) itemsByPaper.set(item.generated_paper_id, (itemsByPaper.get(item.generated_paper_id) ?? 0) + 1);
  const subjects = [...new Set([...SUBJECT_PRESETS, ...questionBankItems.map((item) => item.subject).filter((value): value is string => Boolean(value))])];

  return (
    <main className="space-y-6 p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">Custom Paper Generator</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--ink)]">Assemble papers from the question bank</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          This generator does not invent questions. It selects reusable private question-bank items, then the generated draft goes through normal review and publish checks.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Wand2 size={18} className="text-[var(--primary)]" />
            <h2 className="font-black text-[var(--ink)]">Generate draft</h2>
          </div>
          <form action={generatePaper} className="space-y-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Title</span>
              <input name="title" className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" defaultValue="Generated practice paper" />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Subject</span>
              <select name="subject" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2">
                <option value="">Any subject</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Target marks</span>
              <input name="target_marks" type="number" min="1" className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" defaultValue={30} />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">Duration minutes</span>
              <input name="duration_minutes" type="number" min="1" className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2" defaultValue={60} />
            </label>
            <Button type="submit" className="w-full text-white" disabled={!questionBankItems.length}>
              <FilePlus2 size={16} /> Generate paper
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-black text-[var(--ink)]">Generated drafts</h2>
          {generatedPapers.length ? (
            <div className="space-y-3">
              {generatedPapers.map((paper) => (
                <div key={paper.id} className="rounded-lg border border-[var(--border)] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-[var(--ink)]">{paper.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {paper.subject ?? "No subject"} · target {paper.target_marks ?? "?"} marks · {itemsByPaper.get(paper.id) ?? 0} questions
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-black text-[var(--muted)]">{paper.status}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">
              No generated drafts yet. Add question bank items, then generate a paper.
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
