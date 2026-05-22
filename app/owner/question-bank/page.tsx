import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, Filter, PlusCircle } from "lucide-react";
import { listQuestionBankWorkspace } from "@/lib/usability-data";
import { SUBJECT_PRESETS } from "@/lib/subjects";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

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
    <main className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">Question Bank</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--ink)]">Reusable private questions</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Extract approved root questions from assessments while preserving subquestion hierarchy, source page fallback, topic tags, and markscheme references.
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/owner/question-bank/import-from-assessment" variant="secondary">
            <PlusCircle size={16} /> Extract from assessment
          </ButtonLink>
          <ButtonLink href="/owner/paper-generator">Generate paper</ButtonLink>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
          <Filter size={16} /> Subject filters
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/owner/question-bank" variant={subject === "all" ? "primary" : "secondary"} className={subject === "all" ? "text-white" : ""}>
            All
          </ButtonLink>
          {subjects.map((subjectName) => (
            <ButtonLink
              key={subjectName}
              href={`/owner/question-bank?subject=${encodeURIComponent(subjectName)}`}
              variant={subject === subjectName ? "primary" : "secondary"}
              className={subject === subjectName ? "text-white" : ""}
            >
              {subjectName}
            </ButtonLink>
          ))}
        </div>
      </Card>

      {filteredItems.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredItems.map((item) => (
            <Link key={item.id} href={`/owner/question-bank/${item.id}`} className="block">
              <Card className="h-full p-5 transition hover:border-[var(--primary)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-[var(--subtle)]">
                      {item.paper_code ?? "No paper code"} · {item.root_node_key}
                    </p>
                    <h2 className="mt-2 text-lg font-black text-[var(--ink)]">{item.title ?? `Question ${item.root_node_key}`}</h2>
                  </div>
                  <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-black text-[var(--muted)]">
                    {item.marks_available ?? "?"} marks
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
                  {(item.prompt_html ?? item.prompt_latex ?? "No prompt preview.").replace(/<[^>]+>/g, " ")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.subject ? <Chip>{item.subject}</Chip> : null}
                  {item.tags.slice(0, 4).map((itemTag) => (
                    <Chip key={itemTag}>{itemTag}</Chip>
                  ))}
                  {item.has_visual_assets ? <Chip>visual source</Chip> : null}
                  <Chip>{childrenByItem.get(item.id) ?? 0} child parts</Chip>
                  {item.do_not_reuse ? <Chip>do not reuse</Chip> : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <BookOpen className="mx-auto text-[var(--subtle)]" size={42} />
          <h2 className="mt-4 text-xl font-black text-[var(--ink)]">No question bank items yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            Extract questions from an approved assessment after the parser tree and source-page ranges look correct.
          </p>
        </Card>
      )}
    </main>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-[var(--border)] bg-white px-2 py-1 text-xs font-bold text-[var(--muted)]">{children}</span>;
}
