import { saveStudentConfidenceRating } from "@/app/student/student-actions";
import { MathRenderer } from "@/components/math-renderer";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getStudentAttemptResultsWorkspace } from "@/lib/live-data";
import { HelpCircle, FileCheck, ThumbsUp } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

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
          title="Worked-Solution Comparison" 
          description="Evaluate original prompts, your marked PDF response, and official solutions side-by-side." 
        />
        <ButtonLink href="/student/feedback" variant="secondary" className="text-xs font-semibold shadow-sm transition-all hover:bg-slate-100">
          ← Back to Feedback Inbox
        </ButtonLink>
      </div>

      {/* Main Split-Panel Layout */}
      <div className="grid gap-6 xl:grid-cols-3 max-w-[1600px] mx-auto pb-12">
        
        {/* PANEL 1: Original Question & Markscheme */}
        <Card className="flex flex-col border-[#dde3ee] shadow-md h-[800px] overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/80 border-b border-[#dde3ee] py-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-indigo-900">
              <HelpCircle size={18} className="text-indigo-600" />
              <CardTitle className="text-sm font-bold tracking-wide uppercase">Original Question Node</CardTitle>
            </div>
            <CardDescription className="text-xs">Examine official prompt details and mark schemes.</CardDescription>
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
              <div className="rounded-xl border border-blue-100 bg-blue-50/20 p-4 text-sm mt-4 shadow-inner">
                <p className="mb-2 font-bold text-blue-950 flex items-center gap-1.5 border-b border-blue-100 pb-1.5">
                  📚 Official Worked Solution / Mark Scheme
                </p>
                <div className="paper-body text-slate-800 leading-relaxed max-w-none">
                  <MathRenderer html={workspace.markschemeHtml} />
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {/* PANEL 2: PDF Annotated Answer */}
        <Card className="flex flex-col border-[#dde3ee] shadow-md h-[800px] overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/80 border-b border-[#dde3ee] py-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-indigo-900">
              <FileCheck size={18} className="text-indigo-600" />
              <CardTitle className="text-sm font-bold tracking-wide uppercase">Your Evaluated Script</CardTitle>
            </div>
            <CardDescription className="text-xs">Interactive canvas containing reviewer corrections and overlay notes.</CardDescription>
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

        {/* PANEL 3: Marks, Feedback, & Reflection */}
        <Card className="flex flex-col border-[#dde3ee] shadow-md h-[800px] overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/80 border-b border-[#dde3ee] py-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-indigo-900">
              <ThumbsUp size={18} className="text-indigo-600" />
              <CardTitle className="text-sm font-bold tracking-wide uppercase">Marks & Self-Assessment</CardTitle>
            </div>
            <CardDescription className="text-xs">Record cognitive reflections and save confidence metrics.</CardDescription>
          </CardHeader>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
            
            {/* Score Summary Banner */}
            <div className="rounded-xl bg-emerald-50/40 border border-emerald-100 p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Overall released score</p>
              <h3 className="text-2xl font-black text-emerald-950 mt-1">
                {workspace.feedbackRelease.total_awarded_marks} / {workspace.feedbackRelease.total_available_marks} Marks
              </h3>
            </div>

            {/* Part Level Awarded Marks */}
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

            {/* Marker Annotations & Comments */}
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

            {/* Student Reflection Form */}
            {root ? (
              <div className="border-t border-dashed border-slate-200 pt-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Self-Reflection & Confidence Ledger</h4>
                
                <form action={saveStudentConfidenceRating.bind(null, id, root.id)} className="grid gap-4">
                  <label className="grid gap-1.5 text-xs font-bold text-slate-850">
                    How do you grade your personal confidence after review?
                    <select name="confidence" className="rounded-lg border border-[#dde3ee] bg-white px-3 py-2.5 text-xs shadow-sm font-semibold text-slate-800 focus-visible:outline-blue-500">
                      <option value="5">⭐⭐⭐⭐⭐ Excellent Confidence (5/5)</option>
                      <option value="4">⭐⭐⭐⭐ Satisfactory Clarity (4/5)</option>
                      <option value="3">⭐⭐⭐ Moderate Understanding (3/5)</option>
                      <option value="2">⭐⭐ Needs Consolidation (2/5)</option>
                      <option value="1">⭐ High Confusion / Retake Required (1/5)</option>
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

                  <button 
                    type="submit" 
                    className="rounded-xl bg-slate-900 px-4 py-3 text-xs font-extrabold tracking-wide uppercase text-white shadow-md transition-all duration-150 hover:bg-black hover:shadow-lg active:scale-[0.98]"
                  >
                    Commit Study Takeaways
                  </button>
                </form>
              </div>
            ) : null}

          </div>
        </Card>

      </div>
    </>
  );
}
