import { redirect } from "next/navigation";
import { FilePlus2, Wand2 } from "lucide-react";
import { selectQuestionBankItems } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUBJECT_PRESETS } from "@/lib/subjects";
import { listPaperGeneratorWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

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
    <main className="space-y-6">
      <PageHeader
        eyebrow="Custom paper generator"
        title="Assemble papers from the question bank"
        description="This generator does not invent questions. It selects reusable private question-bank items, then the draft goes through normal review and publish checks."
      />

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="p-6">
          <SectionHeader title="Generate draft" actions={<Wand2 size={18} className="text-[var(--primary)]" aria-hidden="true" />} />
          <form action={generatePaper} className="space-y-4">
            <Field label="Title">
              <Input name="title" defaultValue="Generated practice paper" />
            </Field>
            <Field label="Subject">
              <Select name="subject">
                <option value="">Any subject</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target marks">
              <Input name="target_marks" type="number" min="1" defaultValue={30} />
            </Field>
            <Field label="Duration minutes">
              <Input name="duration_minutes" type="number" min="1" defaultValue={60} />
            </Field>
            <Button type="submit" className="w-full !text-white" disabled={!questionBankItems.length}>
              <FilePlus2 size={16} /> Generate paper
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <SectionHeader title="Generated drafts" />
          {generatedPapers.length ? (
            <DataList>
              {generatedPapers.map((paper) => (
                <DataListRow key={paper.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--ink)]">{paper.title}</p>
                    <DataListMeta className="mt-1">
                      <span>{paper.subject ?? "No subject"}</span>
                      <span>target {paper.target_marks ?? "?"} marks</span>
                      <span>{itemsByPaper.get(paper.id) ?? 0} questions</span>
                    </DataListMeta>
                  </div>
                  <StatusBadge status={paper.status} />
                </DataListRow>
              ))}
            </DataList>
          ) : (
            <EmptyState title="No generated drafts" description="Add question bank items, then generate a paper for review." />
          )}
        </Card>
      </div>
    </main>
  );
}
