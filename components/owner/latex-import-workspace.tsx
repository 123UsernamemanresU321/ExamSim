"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileCode2, ListChecks } from "lucide-react";
import { MathRenderer } from "@/components/math-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseExamsimLatex } from "@/lib/examsim/latex-syntax";

type Props = {
  createDraftAction: (formData: FormData) => void | Promise<void>;
};

const SAMPLE_SOURCE = `\\question[6][topic=modular arithmetic,type=proof]
Prove that if $a^2 \\equiv b^2 \\pmod p$, then $a \\equiv \\pm b \\pmod p$.

\\answerbox{proof}

\\markscheme{
M1: subtracts squares correctly
A1: factors as $(a-b)(a+b)$
A1: applies primality condition
A1: reaches final congruence
}`;

export function LatexImportWorkspace({ createDraftAction }: Props) {
  const [source, setSource] = useState(SAMPLE_SOURCE);
  const result = useMemo(() => parseExamsimLatex(source), [source]);
  const totalMarks = result.questions.reduce((sum, question) => sum + Number(question.marks ?? 0), 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
      <Card className="p-0">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
            <FileCode2 size={17} /> Examsim LaTeX editor
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use structured markers, then review the detected question cards before creating a review draft.
          </p>
        </div>
        <form action={createDraftAction} className="grid gap-4 p-5">
          <textarea
            name="latex_source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="min-h-[520px] w-full rounded-[2px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone={result.questions.length ? "success" : "warning"}>{result.questions.length} questions</Badge>
              <Badge tone="neutral">{totalMarks} inferred marks</Badge>
              <Badge tone={result.warnings.length ? "warning" : "success"}>{result.warnings.length} warnings</Badge>
            </div>
            <Button type="submit" disabled={!result.questions.length}>
              Create review draft
            </Button>
          </div>
        </form>
      </Card>

      <aside className="grid content-start gap-5">
        <Card>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
            <ListChecks size={17} /> Live parse preview
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            This deterministic preview does not publish anything. It records an owner-review draft so uncertain syntax can be corrected before release.
          </p>
          {result.warnings.length ? (
            <div className="mt-4 rounded-[4px] border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
                <AlertTriangle size={14} /> Warnings
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-amber-900">
                {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
        </Card>

        {result.questions.map((question) => (
          <Card key={question.nodeKey} className="p-0">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--ink)]">{question.nodeKey}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {question.topic ?? "No topic"} · {question.answerType ?? "written answer"}
                  </p>
                </div>
                <Badge tone={question.marks === null ? "warning" : "neutral"}>{question.marks ?? "?"} marks</Badge>
              </div>
            </div>
            <div className="grid gap-3 p-4">
              <MathRenderer latex={question.promptLatex} className="rounded-[4px] border border-[var(--border)] bg-white p-3 text-sm" />
              {question.answerBoxes.length ? (
                <div className="rounded-[4px] border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                  Answer zones: {question.answerBoxes.join(", ")}
                </div>
              ) : null}
              {question.rubricPoints.length ? (
                <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Rubric points</p>
                  <div className="mt-2 grid gap-2">
                    {question.rubricPoints.map((point, index) => (
                      <div key={`${point.code ?? "point"}-${index}`} className="flex items-start justify-between gap-3 rounded-[2px] bg-white p-2 text-xs">
                        <span>
                          {point.code ? <strong>{point.code}: </strong> : null}
                          {point.text}
                        </span>
                        <span className="font-mono text-[var(--muted)]">{point.marks ?? "?"}m</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </aside>
    </div>
  );
}
