import { notFound } from "next/navigation";
import { convertGeneratedPaperToAssessmentAction, replaceGeneratedPaperQuestionAction } from "@/app/owner/paper-generator/[paperId]/actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";
import { computeGeneratedPaperHealth } from "@/lib/question-bank";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QuestionBankItem } from "@/types/database";

export default async function GeneratedPaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const context = await requireInstitutionPagePermission("assessment_authoring", `/owner/paper-generator/${paperId}`);
  const supabase = await createSupabaseServerClient();
  const { data: paper, error: paperError } = await supabase.from("generated_papers").select("*").eq("id", paperId).eq("owner_profile_id", context.ownerProfileId).maybeSingle();
  if (paperError) throw paperError;
  if (!paper) notFound();
  const { data: paperItems, error: itemError } = await supabase.from("generated_paper_items").select("*").eq("generated_paper_id", paper.id).order("ordinal");
  if (itemError) throw itemError;
  const ids = (paperItems ?? []).map((item) => item.question_bank_item_id);
  const { data: questions, error: questionError } = ids.length ? await supabase.from("question_bank_items").select("*").in("id", ids).eq("owner_profile_id", context.ownerProfileId) : { data: [], error: null };
  if (questionError) throw questionError;
  const questionById = new Map(((questions ?? []) as QuestionBankItem[]).map((question) => [question.id, question]));
  const orderedQuestions = (paperItems ?? []).map((item) => ({ paperItem: item, question: questionById.get(item.question_bank_item_id) })).filter((row): row is { paperItem: (typeof paperItems)[number]; question: QuestionBankItem } => Boolean(row.question));
  const health = computeGeneratedPaperHealth(orderedQuestions.map((row) => row.question), paper.target_marks);

  return (
    <main className="space-y-6">
      <PageHeader eyebrow="Mock Generator" title={paper.title} description={`${health.totalMarks} selected marks · target ${paper.target_marks ?? "not set"} · readiness ${health.score}%`} actions={<ButtonLink href="/owner/paper-generator" variant="secondary">Back to drafts</ButtonLink>} />
      <section className="border-y border-[var(--border)] bg-white px-5 py-4" aria-labelledby="blueprint-health-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="blueprint-health-heading" className="text-base font-semibold text-[var(--ink)]">Blueprint health</h2><Badge tone={health.blockers.length ? "danger" : health.warnings.length ? "warning" : "success"}>{health.blockers.length ? "blocked" : health.warnings.length ? "review warnings" : "ready to convert"}</Badge></div>
        {[...health.blockers, ...health.warnings].length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">{[...health.blockers, ...health.warnings].map((message) => <li key={message}>{message}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">Question readiness, marks, source requirements, and blueprint total are consistent.</p>}
      </section>
      <Card>
        <SectionHeader title="Selected questions" description="Replace a question without changing the rest of the reviewed blueprint." />
        <DataList className="mt-4">
          {orderedQuestions.map(({ paperItem, question }) => (
            <DataListRow key={paperItem.id} className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <span className="font-mono text-sm font-semibold">{paperItem.ordinal}</span>
              <div><p className="font-semibold text-[var(--ink)]">{question.title ?? question.root_node_key}</p><DataListMeta><span>{question.marks_available ?? "?"} marks</span><span>{question.subject ?? "No subject"}</span><span>{question.command_term ?? "No command term"}</span><span>{question.readiness_status}</span></DataListMeta></div>
              <form action={replaceGeneratedPaperQuestionAction.bind(null, paper.id, paperItem.id)}><Button type="submit" variant="secondary">Replace question</Button></form>
            </DataListRow>
          ))}
        </DataList>
      </Card>
      <div className="flex justify-end">
        <form action={convertGeneratedPaperToAssessmentAction.bind(null, paper.id)}>
          <Button type="submit" disabled={Boolean(health.blockers.length) || paper.status !== "draft"}>Convert to editable assessment draft</Button>
        </form>
      </div>
    </main>
  );
}
