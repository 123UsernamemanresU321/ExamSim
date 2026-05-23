import { saveStudentConfidenceRating } from "@/app/student/student-actions";
import { MathRenderer } from "@/components/math-renderer";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getStudentAttemptResultsWorkspace } from "@/lib/live-data";

export default async function WorkedSolutionComparisonPage({ params }: { params: Promise<{ id: string; rootQuestionNodeId: string }> }) {
  const { id, rootQuestionNodeId } = await params;
  const workspace = await getStudentAttemptResultsWorkspace(id);
  const root = workspace.questionNodes.find((node) => node.id === rootQuestionNodeId) ?? workspace.questionNodes.find((node) => node.parent_node_id === null) ?? null;
  const slot = root ? workspace.uploadSlots.find((item) => item.question_node_id === root.id) : null;
  const marks = root ? workspace.marks.filter((mark) => mark.question_node_id === root.id) : [];
  const annotations = root ? workspace.annotations.filter((annotation) => annotation.question_node_id === root.id && annotation.annotation_type === "feedback") : [];
  const annotatedUrl = slot ? workspace.annotatedUploadUrls[slot.id] : null;

  if (!workspace.feedbackRelease?.visible_to_student) {
    return <SectionHeading title="Comparison not released" description="This view opens after feedback is explicitly released." />;
  }

  return (
    <>
      <SectionHeading title="Worked-Solution Comparison" description="Compare the original question, your released annotated work, marks, feedback, and confidence after review." />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <h2 className="text-lg font-semibold">Original question</h2>
          {root ? (
            <div className="mt-4 question-prompt">
              <p className="mb-2 font-semibold">{root.display_label ?? root.node_key}</p>
              <MathRenderer html={root.prompt_html ?? root.prompt_latex ?? root.title ?? "Question prompt unavailable."} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">Question prompt unavailable.</p>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Your released answer</h2>
          {annotatedUrl ? (
            <iframe
              title="Released annotated answer"
              src={annotatedUrl}
              className="mt-4 h-[620px] w-full rounded-md border border-[var(--border)]"
            />
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">No released annotated PDF is available for this question yet.</p>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Feedback and confidence</h2>
          <div className="mt-4 grid gap-3">
            <Badge tone="success">
              {workspace.feedbackRelease.total_awarded_marks}/{workspace.feedbackRelease.total_available_marks} released marks
            </Badge>
            {marks.map((mark) => (
              <div key={mark.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
                Awarded {mark.awarded_marks} mark{mark.awarded_marks === 1 ? "" : "s"}
              </div>
            ))}
            {annotations.map((annotation) => (
              <div key={annotation.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
                <MathRenderer html={annotation.body} />
              </div>
            ))}
            {workspace.markschemeHtml ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
                <p className="mb-2 font-semibold">Released worked solution / markscheme</p>
                <MathRenderer html={workspace.markschemeHtml} />
              </div>
            ) : null}
          </div>
          {root ? (
            <form action={saveStudentConfidenceRating.bind(null, id, root.id)} className="mt-5 grid gap-3">
              <label className="grid gap-1 text-sm font-semibold">
                After reviewing this, how confident do you feel?
                <select name="confidence" className="rounded-md border border-[var(--border)] bg-white px-3 py-2">
                  <option value="1">1 - not confident</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5 - confident</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Note
                <textarea name="note" className="min-h-24 rounded-md border border-[var(--border)] px-3 py-2" />
              </label>
              <button type="submit" className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">Save confidence rating</button>
            </form>
          ) : null}
        </Card>
      </div>
    </>
  );
}
