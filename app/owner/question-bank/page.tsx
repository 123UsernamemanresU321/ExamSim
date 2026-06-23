import Link from "next/link";
import type { ReactNode } from "react";
import { Filter, PlusCircle } from "lucide-react";
import { listQuestionBankWorkspace } from "@/lib/usability-data";
import { SUBJECT_PRESETS } from "@/lib/subjects";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LibraryFilters = { subject?: string; tag?: string; subtopic?: string; difficulty?: string; marks_min?: string; marks_max?: string; year?: string; paper_type?: string; command_term?: string; response_type?: string; readiness?: string; standard?: string };

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<LibraryFilters> }) {
  const filters = await searchParams;
  const { subject = "all", tag = "" } = filters;
  const { items, children } = await listQuestionBankWorkspace();
  const supabase = await createSupabaseServerClient();
  const { data: standards, error: standardsError } = await supabase.from("curriculum_standards").select("id,code,title").eq("review_status", "approved").order("code");
  if (standardsError) throw standardsError;
  const childrenByItem = new Map<string, number>();
  for (const child of children) childrenByItem.set(child.question_bank_item_id, (childrenByItem.get(child.question_bank_item_id) ?? 0) + 1);
  const subjects = [...new Set([...SUBJECT_PRESETS, ...items.map((item) => item.subject).filter((value): value is string => Boolean(value))])];
  const filteredItems = items.filter((item) => {
    const subjectMatch = subject === "all" || item.subject === subject;
    const tagMatch = !tag || item.tags.some((itemTag) => itemTag.toLowerCase().includes(tag.toLowerCase()));
    const minimumMarks = Number(filters.marks_min ?? 0);
    const maximumMarks = Number(filters.marks_max ?? 0);
    return subjectMatch
      && tagMatch
      && (!filters.subtopic || item.subtopic?.toLowerCase().includes(filters.subtopic.toLowerCase()))
      && (!filters.difficulty || item.estimated_difficulty === Number(filters.difficulty))
      && (!minimumMarks || Number(item.marks_available ?? -1) >= minimumMarks)
      && (!maximumMarks || Number(item.marks_available ?? Number.POSITIVE_INFINITY) <= maximumMarks)
      && (!filters.year || item.year === Number(filters.year))
      && (!filters.paper_type || item.paper_type === filters.paper_type)
      && (!filters.command_term || item.command_term === filters.command_term)
      && (!filters.response_type || item.answer_mode === filters.response_type)
      && (!filters.readiness || item.readiness_status === filters.readiness)
      && (!filters.standard || item.curriculum_standard_ids.includes(filters.standard));
  });

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Question Library"
        title="Reusable private questions"
        description="Extract approved root questions from assessments while preserving hierarchy, source pages, topic tags, and markscheme references."
        actions={
          <>
          <ButtonLink href="/owner/question-bank/import-from-assessment" variant="secondary">
            <PlusCircle size={16} /> Extract from assessment
          </ButtonLink>
          <ButtonLink href="/owner/paper-generator">Generate paper</ButtonLink>
          </>
        }
      />

      <section className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
        <SectionHeader
          title="Library filters"
          description="Use subjects to scope extraction and paper generation."
          className="mb-3"
          actions={<Filter size={16} className="text-[var(--subtle)]" aria-hidden="true" />}
        />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/owner/question-bank" variant={subject === "all" ? "primary" : "secondary"} className={subject === "all" ? "!text-white" : ""}>
            All
          </ButtonLink>
          {subjects.map((subjectName) => (
            <ButtonLink
              key={subjectName}
              href={`/owner/question-bank?subject=${encodeURIComponent(subjectName)}`}
              variant={subject === subjectName ? "primary" : "secondary"}
              className={subject === subjectName ? "!text-white" : ""}
            >
            {subjectName}
            </ButtonLink>
          ))}
        </div>
        <form method="get" className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 md:grid-cols-3 xl:grid-cols-5">
          <input type="hidden" name="subject" value={subject} />
          <Field label="Topic / tag"><Input name="tag" defaultValue={tag} placeholder="mechanics" /></Field>
          <Field label="Subtopic"><Input name="subtopic" defaultValue={filters.subtopic ?? ""} /></Field>
          <Field label="Difficulty"><Select name="difficulty" defaultValue={filters.difficulty ?? ""}><option value="">Any</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
          <Field label="Minimum marks"><Input name="marks_min" type="number" min="0" defaultValue={filters.marks_min ?? ""} /></Field>
          <Field label="Maximum marks"><Input name="marks_max" type="number" min="0" defaultValue={filters.marks_max ?? ""} /></Field>
          <Field label="Year"><Input name="year" type="number" min="1900" max="2200" defaultValue={filters.year ?? ""} /></Field>
          <Field label="Paper type"><Input name="paper_type" defaultValue={filters.paper_type ?? ""} placeholder="Paper 1" /></Field>
          <Field label="Command term"><Input name="command_term" defaultValue={filters.command_term ?? ""} placeholder="calculate" /></Field>
          <Field label="Response type"><Select name="response_type" defaultValue={filters.response_type ?? ""}><option value="">Any</option>{["typed_text","upload_pdf","typed_or_upload","multiple_choice","numerical"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</Select></Field>
          <Field label="Readiness"><Select name="readiness" defaultValue={filters.readiness ?? ""}><option value="">Any</option><option value="ready">Ready</option><option value="needs_review">Needs review</option><option value="retired">Retired</option></Select></Field>
          {standards?.length ? <Field label="Standard"><Select name="standard" defaultValue={filters.standard ?? ""}><option value="">Any</option>{standards.map((standard) => <option key={standard.id} value={standard.id}>{standard.code} · {standard.title}</option>)}</Select></Field> : null}
          <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Apply</Button><ButtonLink href="/owner/question-bank" variant="ghost">Clear</ButtonLink></div>
        </form>
      </section>

      {filteredItems.length ? (
        <DataTable headers={["Question", "Subject & tags", "Marks", "Structure", "Action"]}>
          {filteredItems.map((item) => (
            <DataTableRow key={item.id}>
              <DataTableCell className="w-[42%]">
                <Link href={`/owner/question-bank/${item.id}`} className="min-w-0">
                  <p className="truncate font-semibold text-[var(--ink)]">{item.title ?? `Question ${item.root_node_key}`}</p>
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                    {item.paper_code ?? "No paper code"} · {item.root_node_key}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                  {(item.prompt_html ?? item.prompt_latex ?? "No prompt preview.").replace(/<[^>]+>/g, " ")}
                  </p>
                </Link>
              </DataTableCell>
              <DataTableCell className="w-[25%]">
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.subject ? <Chip>{item.subject}</Chip> : null}
                  {item.tags.slice(0, 4).map((itemTag) => (
                    <Chip key={itemTag}>{itemTag}</Chip>
                  ))}
                  {item.has_visual_assets ? <Chip>visual source</Chip> : null}
                  {item.do_not_reuse ? <Chip>do not reuse</Chip> : null}
                  <Chip>{item.readiness_status.replaceAll("_", " ")}</Chip>
                  {item.command_term ? <Chip>{item.command_term}</Chip> : null}
                </div>
              </DataTableCell>
              <DataTableCell className="w-[10%] font-mono text-xs">{item.marks_available ?? "?"}</DataTableCell>
              <DataTableCell className="w-[13%] text-xs text-[var(--muted)]">{childrenByItem.get(item.id) ?? 0} child parts</DataTableCell>
              <DataTableCell className="w-[10%] text-right">
                <ButtonLink href={`/owner/question-bank/${item.id}`} variant="secondary">
                  Open
                </ButtonLink>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No question library items yet"
          description="Extract questions from an approved assessment after the parser tree and source-page ranges look correct."
        />
      )}
    </main>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-[2px] border border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--muted)]">{children}</span>;
}
