import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { groupSimilarAnswers } from "@/lib/answer-grouping";
import { buildMarkingTree, flattenMarkingTree, getMarkableLeafNodes, getSelectableMarkingGroups } from "@/lib/marking-tree";
import { getCrossMarkWorkspace } from "@/lib/usability-data";

export default async function CrossMarkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCrossMarkWorkspace(id);
  const tree = buildMarkingTree(workspace.questionNodes);
  const roots = getSelectableMarkingGroups(tree);
  const firstRoot = roots[0] ?? null;
  const leaves = firstRoot ? getMarkableLeafNodes(firstRoot) : [];
  const firstLeaf = leaves[0] ?? null;
  const responses = firstLeaf
    ? workspace.attempts.map((attempt) => ({
        attempt,
        mark: workspace.marks.find((mark) => mark.attempt_id === attempt.id && mark.question_node_id === firstLeaf.id) ?? null,
        slot: workspace.uploadSlots.find((slot) => slot.attempt_id === attempt.id && slot.question_node_id === firstRoot?.id) ?? null,
      }))
    : [];
  const answerGroups = firstLeaf
    ? groupSimilarAnswers(
        workspace.textResponses
          .filter((response) => response.question_node_id === firstLeaf.id)
          .map((response) => ({
            id: response.id,
            question_node_id: response.question_node_id,
            attempt_id: response.attempt_id,
            answer_text: response.answer_text,
            response_mode: firstLeaf.response_mode,
          })),
      )
    : [];

  return (
    <>
      <SectionHeading
        title="Cross-student Marking"
        description="Mark the same question across all assigned students without opening each attempt one-by-one."
      />
      <div className="grid gap-5 xl:grid-cols-[280px_1fr_340px]">
        <Card className="content-start">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--subtle)]">Question selector</h2>
          <div className="grid gap-2">
            {flattenMarkingTree(tree).map((node) => (
              <div key={node.id} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm" style={{ marginLeft: node.depth_resolved * 12 }}>
                {node.node_key} {node.children.length ? `(${node.children.length} parts)` : ""}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">{firstLeaf ? `Current target: ${firstLeaf.node_key}` : "No markable question selected"}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {responses.filter((item) => item.mark).length} / {responses.length} responses marked
          </p>
          <div className="mt-5 grid gap-3">
            {responses.map(({ attempt, mark, slot }) => (
              <div key={attempt.id} className="rounded-md border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{attempt.profiles?.display_name ?? "Student"}</p>
                  <p className="text-sm font-semibold">{mark ? `${mark.awarded_marks} marks` : "Unmarked"}</p>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">Upload: {slot?.original_file_name ?? slot?.status ?? "no root upload"}</p>
                <ButtonLink className="mt-3" href={`/owner/attempts/${attempt.id}/mark`} variant="secondary">Open full marking workspace</ButtonLink>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Answer groups</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Deterministic grouping only. Review each group before applying marks; no AI decision is applied automatically.
          </p>
          <div className="mt-4 grid gap-2">
            {answerGroups.length ? answerGroups.slice(0, 8).map((group) => (
              <div key={group.key} className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--ink)]">{group.label}</p>
                  <Badge tone={group.confidence === "manual_review" ? "warning" : "neutral"}>{group.count}</Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">{group.confidence.replaceAll("_", " ")} match · {group.response_ids.length} responses</p>
              </div>
            )) : (
              <p className="rounded-[4px] border border-dashed border-[var(--border)] p-3 text-sm text-[var(--muted)]">
                No typed or numerical answers available for this selected target.
              </p>
            )}
          </div>
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <h2 className="text-lg font-semibold">Shortcuts</h2>
          <ul className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
            <li><kbd>J</kbd> next response</li>
            <li><kbd>K</kbd> previous response</li>
            <li><kbd>M</kbd> focus mark input</li>
            <li><kbd>C</kbd> focus comment</li>
            <li><kbd>F</kbd> flag</li>
            <li><kbd>S</kbd> save</li>
          </ul>
          <p className="mt-4 text-xs leading-5 text-[var(--muted)]">This MVP view preserves correct attempt/question IDs and links into the full marking workspace for actual save operations.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
