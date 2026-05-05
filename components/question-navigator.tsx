import type { QuestionNode } from "@/lib/assessment-package";
import { flattenQuestionNodes } from "@/lib/assessment-package";

export function QuestionNavigator({ questions }: { questions: QuestionNode[] }) {
  const nodes = flattenQuestionNodes(questions).filter((node) => node.node_type !== "section");
  return (
    <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4" aria-label="Question navigator">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">Questions</h2>
      <nav className="grid grid-cols-4 gap-2 lg:grid-cols-3">
        {nodes.map((node) => (
          <a
            key={node.node_id}
            href={`#${node.node_id}`}
            className="grid aspect-square min-h-10 place-items-center rounded-md border border-[var(--border)] bg-white px-2 text-center text-sm font-semibold hover:bg-[var(--surface-panel)]"
          >
            {node.node_key}
          </a>
        ))}
      </nav>
    </aside>
  );
}
