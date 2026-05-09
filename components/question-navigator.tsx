import type { QuestionNode } from "@/lib/assessment-package";
import { flattenQuestionNodes } from "@/lib/assessment-package";

export function QuestionNavigator({ questions }: { questions: QuestionNode[] }) {
  const nodes = flattenQuestionNodes(questions).filter((node) => node.node_type !== "section");
  return (
    <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4" aria-label="Question navigator">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">Questions</h2>
      <nav className="flex flex-col gap-2">
        {nodes.map((node) => (
          <a
            key={node.node_id}
            href={`#${node.node_id}`}
            className={`relative flex min-h-9 items-center rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold transition-colors hover:bg-[var(--surface-panel)] ${
              node.node_type === "subquestion" ? "ml-4" : node.node_type === "part" ? "ml-8" : ""
            }`}
          >
            {(node.node_type === "subquestion" || node.node_type === "part") && (
              <div
                className="absolute bottom-1/2 left-[-0.75rem] top-[-1rem] w-2 rounded-bl-md border-b-2 border-l-2 border-[var(--border)] opacity-60"
                aria-hidden="true"
              />
            )}
            {node.node_key}
          </a>
        ))}
      </nav>
    </aside>
  );
}
