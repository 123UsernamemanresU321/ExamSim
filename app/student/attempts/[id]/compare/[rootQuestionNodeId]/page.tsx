import { saveStudentConfidenceRating } from "@/app/student/student-actions";
import { MathRenderer } from "@/components/math-renderer";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getStudentAttemptResultsWorkspace } from "@/lib/live-data";
import { HelpCircle, FileCheck, ThumbsUp } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <SectionHeading 
          title="Worked-solution comparison" 
          description="Compare the original prompt, your released annotated response, and allowed solutions or markscheme content." 
        />
        <ButtonLink href="/student/feedback" variant="secondary">
          Back to feedback inbox
        </ButtonLink>
      </div>

      <div className="grid gap-6 xl:grid-cols-3 max-w-[1600px] mx-auto pb-12">
        <Card className="flex h-[800px] flex-col overflow-hidden border-[var(--border)] bg-white shadow-[var(--shadow-card)]">
          <CardHeader className="flex-shrink-0 border-b border-[var(--border)] bg-white py-4">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <HelpCircle size={18} className="text-[var(--primary)]" />
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.1em]">Original question</CardTitle>
            </div>
            <CardDescription className="text-xs">Prompt text and any released markscheme content.</CardDescription>
          </CardHeader>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
            {root ? (
              <div className="space-y-4">
                <div className="border-b border-[#dde3ee] pb-3">
                  <span className="inline-block rounded bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1">
                    Question Part {root.node_key}
                  </span>
                </div>
                <div className="paper-body prose question-prompt text-slate-800 leading-relaxed text-base max-w-none">
                  <MathRenderer html={root.prompt_html ?? root.prompt_latex ?? root.title ?? "Question prompt unavailable."} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)] italic">Question prompt unavailable.</p>
            )}

            {workspace.markschemeHtml ? (
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                <p className="mb-2 flex items-center gap-1.5 border-b border-[var(--border)] pb-1.5 font-semibold text-[var(--ink)]">
                  Released worked solution or markscheme
                </p>
                <div className="paper-body text-slate-800 leading-relaxed max-w-none">
                  <MathRenderer html={workspace.markschemeHtml} />
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="flex h-[800px] flex-col overflow-hidden border-[var(--border)] bg-white shadow-[var(--shadow-card)]">
          <CardHeader className="flex-shrink-0 border-b border-[var(--border)] bg-white py-4">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <FileCheck size={18} className="text-[var(--primary)]" />
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.1em]">Your evaluated script</CardTitle>
            </div>
            <CardDescription className="text-xs">Released annotated PDF, if the owner made it visible.</CardDescription>
          </CardHeader>
          
          <div className="flex-1 bg-slate-100/50 p-4 flex flex-col justify-center">
            {annotatedUrl ? (
              <iframe
                title="Released annotated answer"
                src={annotatedUrl}
                className="h-full w-full rounded-lg border border-slate-300 bg-white shadow-inner"
              />
            ) : (
              <div className="text-center p-8">
                <p className="text-sm text-[var(--muted)] italic">No annotated PDF script is released for this question node.</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex h-[800px] flex-col overflow-hidden border-[var(--border)] bg-white shadow-[var(--shadow-card)]">
          <CardHeader className="flex-shrink-0 border-b border-[var(--border)] bg-white py-4">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <ThumbsUp size={18} className="text-[var(--primary)]" />
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.1em]">Marks and reflection</CardTitle>
            </div>
            <CardDescription className="text-xs">Review released marks and save your confidence after feedback.</CardDescription>
          </CardHeader>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
            <div className="rounded-xl bg-emerald-50/40 border border-emerald-100 p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Overall released score</p>
              <h3 className="mt-1 text-2xl font-semibold text-emerald-950">
                {workspace.feedbackRelease.total_awarded_marks} / {workspace.feedbackRelease.total_available_marks} Marks
              </h3>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Subpart Score Breakdown</h4>
              {marks.length ? marks.map((mark) => (
                <div key={mark.id} className="rounded-lg border border-slate-200 bg-white p-3.5 text-sm flex items-center justify-between shadow-sm">
                  <span className="font-semibold text-slate-800">Question Node Points</span>
                  <Badge tone="success" className="font-bold">
                    +{mark.awarded_marks} Awarded
                  </Badge>
                </div>
              )) : (
                <p className="text-xs text-[var(--subtle)] italic">No marks logged for this partition.</p>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Marker Correction Feedback</h4>
              {annotations.length ? annotations.map((annotation) => (
                <div key={annotation.id} className="rounded-lg border border-indigo-100 bg-indigo-50/20 p-4 text-sm text-indigo-950 leading-relaxed shadow-sm">
                  <MathRenderer html={annotation.body} />
                </div>
              )) : (
                <p className="text-xs text-[var(--subtle)] italic">No specific written notes left on this question container.</p>
              )}
            </div>

            {root ? (
              <div className="border-t border-dashed border-slate-200 pt-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Self-Reflection & Confidence Ledger</h4>
                
                <form action={saveStudentConfidenceRating.bind(null, id, root.id)} className="grid gap-4">
                  <label className="grid gap-1.5 text-xs font-bold text-slate-850">
                    How do you grade your personal confidence after review?
                    <select name="confidence" className="rounded-lg border border-[#dde3ee] bg-white px-3 py-2.5 text-xs shadow-sm font-semibold text-slate-800 focus-visible:outline-blue-500">
                      <option value="5">5 - Excellent confidence</option>
                      <option value="4">4 - Satisfactory clarity</option>
                      <option value="3">3 - Moderate understanding</option>
                      <option value="2">2 - Needs consolidation</option>
                      <option value="1">1 - Retake required</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-bold text-slate-850">
                    Reflective Notes (Mistakes made, concepts clarified, action items)
                    <textarea 
                      name="note" 
                      placeholder="Write your study takeaways, formulas to memorize, or notes to review before next simulation..."
                      className="min-h-24 rounded-lg border border-[#dde3ee] px-3 py-2.5 text-xs shadow-sm focus-visible:outline-blue-500" 
                    />
                  </label>

                  <Button type="submit" className="text-xs font-semibold uppercase tracking-[0.1em]">
                    Save study takeaways
                  </Button>
                </form>
              </div>
            ) : null}

          </div>
        </Card>

      </div>
    </>
  );
}
