import { Flag, UploadCloud } from "lucide-react";
import { MathRenderer } from "@/components/math-renderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { QuestionNode } from "@/lib/assessment-package";

function QuestionBlock({ node, readonly = false }: { node: QuestionNode; readonly?: boolean }) {
  return (
    <article id={node.node_id} className="scroll-mt-24 border-t border-[#dde3ee] py-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="paper-body text-xl font-semibold text-[var(--ink)]">
            {node.node_key}. {node.title}
          </h2>
          {typeof node.marks === "number" ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{node.marks} marks</p>
          ) : null}
        </div>
        <Badge tone={node.response_mode.includes("upload") ? "warning" : "neutral"}>
          {node.response_mode.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className="paper-body prose question-prompt max-w-none text-lg leading-relaxed">
        <MathRenderer html={node.prompt?.html} latex={node.prompt?.html ? undefined : node.prompt?.latex} />
      </div>
      {node.response_mode === "typed_text" || node.response_mode === "typed_or_upload" ? (
        <label className="mt-5 grid gap-2 text-sm font-semibold text-[var(--ink)]">
          Typed response
          <textarea
            className="paper-body min-h-32 rounded-md border border-[var(--border)] bg-white p-3 text-base"
            disabled={readonly}
            defaultValue={readonly ? "Readonly after writing time." : ""}
          />
        </label>
      ) : null}
      {node.response_mode === "upload_pdf" || node.response_mode === "typed_or_upload" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={readonly}>
            <UploadCloud size={16} aria-hidden="true" />
            Request upload slot
          </Button>
          <Button type="button" variant="ghost">
            <Flag size={16} aria-hidden="true" />
            Flag for review
          </Button>
        </div>
      ) : null}
      {node.children?.map((child) => <QuestionBlock key={child.node_id} node={child} readonly={readonly} />)}
    </article>
  );
}

export function QuestionPaper({ questions, readonly = false }: { questions: QuestionNode[]; readonly?: boolean }) {
  return (
    <main className="paper-sheet min-h-[80vh] rounded-lg border border-[var(--border)] px-6 py-8 md:px-12 md:py-12">
      <div className="mx-auto max-w-[920px]">
        {questions.map((node) => (
          <QuestionBlock key={node.node_id} node={node} readonly={readonly} />
        ))}
      </div>
    </main>
  );
}
