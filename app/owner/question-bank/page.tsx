import Link from "next/link";
import type { ReactNode } from "react";
import { Filter, PlusCircle } from "lucide-react";
import { listQuestionBankWorkspace } from "@/lib/usability-data";
import { SUBJECT_PRESETS } from "@/lib/subjects";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<{ subject?: string; tag?: string }> }) {
  const { subject = "all", tag = "" } = await searchParams;
  const { items, children } = await listQuestionBankWorkspace();
  const childrenByItem = new Map<string, number>();
  for (const child of children) childrenByItem.set(child.question_bank_item_id, (childrenByItem.get(child.question_bank_item_id) ?? 0) + 1);
  const subjects = [...new Set([...SUBJECT_PRESETS, ...items.map((item) => item.subject).filter((value): value is string => Boolean(value))])];
  const filteredItems = items.filter((item) => {
    const subjectMatch = subject === "all" || item.subject === subject;
    const tagMatch = !tag || item.tags.some((itemTag) => itemTag.toLowerCase().includes(tag.toLowerCase()));
    return subjectMatch && tagMatch;
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
