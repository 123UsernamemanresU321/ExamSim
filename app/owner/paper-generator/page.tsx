import { redirect } from "next/navigation";
import { FilePlus2, Wand2 } from "lucide-react";
import { computeGeneratedPaperHealth, selectQuestionBankItems } from "@/lib/question-bank";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { splitTags, SUBJECT_PRESETS } from "@/lib/subjects";
import { listPaperGeneratorWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

async function generatePaper(formData: FormData) {
  "use server";
  const { ownerProfileId } = await requireInstitutionPermission("assessment_authoring");
  const title = String(formData.get("title") ?? "Generated paper").trim() || "Generated paper";
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const targetMarks = Number(formData.get("target_marks") ?? 30);
  const durationMinutes = Number(formData.get("duration_minutes") ?? 60);
  const topicTags = splitTags(formData.get("topic_tags"));
  const commandTerms = splitTags(formData.get("command_terms"));
  const paperTypes = splitTags(formData.get("paper_types"));
  const standardIds = formData.getAll("standard_ids").map(String).filter(Boolean);
  const difficultyMin = Number(formData.get("difficulty_min") ?? 0) || null;
  const difficultyMax = Number(formData.get("difficulty_max") ?? 0) || null;
  const supabase = await createSupabaseServerClient();
  const { data: items, error: itemError } = await supabase
    .from("question_bank_items")
    .select("*")
    .eq("owner_profile_id", ownerProfileId)
    .eq("do_not_reuse", false);
  if (itemError) throw itemError;
  let avoidQuestionIds: string[] = [];
  if (formData.get("avoid_recently_used") === "on") {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentItems, error: recentError } = await supabase
      .from("generated_paper_items")
      .select("question_bank_item_id")
      .gte("created_at", cutoff);
    if (recentError) throw recentError;
    avoidQuestionIds = [...new Set((recentItems ?? []).map((item) => item.question_bank_item_id))];
  }
  const criteria = { subject, topicTags, targetMarks, difficultyMin, difficultyMax, commandTerms, paperTypes, standardIds, avoidQuestionIds, includeVisualQuestions: true };
  const selection = selectQuestionBankItems(items ?? [], criteria);
  const health = computeGeneratedPaperHealth(selection.selectedItems, targetMarks);
  const { data: paper, error: paperError } = await supabase
    .from("generated_papers")
    .insert({
      owner_profile_id: ownerProfileId,
      title,
      subject,
      target_marks: targetMarks,
      target_duration_seconds: Math.max(1, durationMinutes) * 60,
      criteria_json: { ...criteria, target_marks: targetMarks, warnings: selection.warnings },
      readiness_score: health.score,
      health_warnings_json: [...health.blockers, ...health.warnings],
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
  const supabase = await createSupabaseServerClient();
  const { data: standards, error: standardsError } = await supabase.from("curriculum_standards").select("id,code,title").order("code");
  if (standardsError) throw standardsError;

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Mock Generator"
        title="Assemble mock papers from the question library"
        description="This generator does not invent questions. It selects reusable private question-library items, then the draft goes through normal review and publish checks."
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
            <Field label="Topics / subtopics" tooltip="Comma-separated tags that selected questions should match.">
              <Input name="topic_tags" placeholder="algebra, linear equations" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum difficulty"><Input name="difficulty_min" type="number" min="1" max="5" /></Field>
              <Field label="Maximum difficulty"><Input name="difficulty_max" type="number" min="1" max="5" /></Field>
            </div>
            <Field label="Command terms" tooltip="Comma-separated command terms such as calculate or explain."><Input name="command_terms" placeholder="calculate, determine" /></Field>
            <Field label="Paper types" tooltip="Comma-separated source paper types."><Input name="paper_types" placeholder="Paper 1" /></Field>
            {standards?.length ? (
              <Field label="Standards" tooltip="Select one or more standards required by the blueprint.">
                <Select name="standard_ids" multiple className="min-h-28">
                  {standards.map((standard) => <option key={standard.id} value={standard.id}>{standard.code} · {standard.title}</option>)}
                </Select>
              </Field>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]"><input name="avoid_recently_used" type="checkbox" defaultChecked /> Avoid questions used in generated papers during the last 180 days</label>
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
                  <div className="flex items-center gap-2"><StatusBadge status={paper.status} /><ButtonLink href={`/owner/paper-generator/${paper.id}`} variant="secondary">Review</ButtonLink></div>
                </DataListRow>
              ))}
            </DataList>
          ) : (
            <EmptyState title="No generated drafts" description="Add question library items, then generate a mock paper for review." />
          )}
        </Card>
      </div>
    </main>
  );
}
