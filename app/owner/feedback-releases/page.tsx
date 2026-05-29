import { Eye, EyeOff, Layers, ShieldCheck, Users, HelpCircle } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listFeedbackReleaseControlRows } from "@/lib/usability-data";

export default async function FeedbackReleaseControlPage() {
  const rows = await listFeedbackReleaseControlRows();

  // Group attempts by cohort (Assessment Title)
  const cohorts: Record<string, any[]> = {};
  rows.forEach((row) => {
    const attemptAny = row.attempt as any;
    const assessment = Array.isArray(attemptAny.assessments) ? attemptAny.assessments[0] : attemptAny.assessments;
    const key = assessment?.title ?? "General Assessment Cohort";
    if (!cohorts[key]) cohorts[key] = [];
    cohorts[key].push(row);
  });

  const cohortKeys = Object.keys(cohorts);

  return (
    <main className="max-w-[1200px] mx-auto space-y-8 pb-12">
      <SectionHeading
        title="Feedback Release Dashboard"
        description="Deliberately control and dispatch cohort review layers. Release marks, assessor commentaries, and marked PDFs when moderation is finalized."
      />

      {/* Cohort Release Hub Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-[#dde3ee] bg-white p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2.5 text-slate-900">
            <Layers size={18} className="text-blue-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Active Cohorts</span>
          </div>
          <h3 className="text-2xl font-black text-slate-950 mt-2">{cohortKeys.length} Subjects</h3>
        </Card>

        <Card className="border-[#dde3ee] bg-white p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2.5 text-slate-900">
            <Users size={18} className="text-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Feedback Released</span>
          </div>
          <h3 className="text-2xl font-black text-slate-950 mt-2">
            {rows.filter((r) => r.release?.visible_to_student).length} / {rows.length} Scripts
          </h3>
        </Card>

        <Card className="border-[#dde3ee] bg-white p-5 flex flex-col justify-between shadow-sm">
          <div className="flex items-center gap-2.5 text-slate-900">
            <ShieldCheck size={18} className="text-indigo-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Release Precision Mode</span>
          </div>
          <h3 className="text-xs font-semibold text-slate-700 mt-2 leading-relaxed">
            Locked draft states prevent premature student access during marking stages.
          </h3>
        </Card>
      </div>

      {/* Grouped Cohort Workspaces */}
      <div className="space-y-8">
        {cohortKeys.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-2 bg-white">
            <HelpCircle size={40} className="mx-auto text-slate-300" />
            <p className="text-sm text-[var(--muted)] font-semibold mt-4 italic">No attempts are currently waiting for release protocols.</p>
          </Card>
        ) : (
          cohortKeys.map((cohortName) => {
            const cohortRows = cohorts[cohortName] ?? [];
            const releasedCount = cohortRows.filter((r) => r.release?.visible_to_student).length;
            const totalCount = cohortRows.length;
            const isFullyReleased = releasedCount === totalCount;

            return (
              <div key={cohortName} className="space-y-4">
                
                {/* Cohort Header Section */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dde3ee] pb-2.5 px-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-950 text-[10px] font-bold text-white font-mono">
                      C
                    </span>
                    <h3 className="font-extrabold text-slate-950 tracking-tight text-base">{cohortName}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">
                      Released: {releasedCount} / {totalCount}
                    </span>
                    <Badge tone={isFullyReleased ? "success" : "neutral"} className="text-[9px] uppercase font-bold tracking-wider">
                      {isFullyReleased ? "Complete" : "In Progress"}
                    </Badge>
                  </div>
                </div>

                {/* Cohort Student List */}
                <div className="grid gap-3.5">
                  {cohortRows.map(({ attempt, release }) => {
                    const attemptAny = attempt as any;
                    const assessment = Array.isArray(attemptAny.assessments) ? attemptAny.assessments[0] : attemptAny.assessments;
                    const student = Array.isArray(attemptAny.profiles) ? attemptAny.profiles[0] : attemptAny.profiles;
                    const isReleased = Boolean(release?.visible_to_student);

                    return (
                      <Card 
                        key={attempt.id} 
                        className={`flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-4.5 border transition-all duration-200 hover:shadow bg-white ${
                          isReleased 
                            ? "border-emerald-100 border-l-[5px] border-l-emerald-500 bg-emerald-50/5" 
                            : "border-[#dde3ee] border-l-[5px] border-l-slate-400 bg-slate-50/10"
                        }`}
                      >
                        <div>
                          {/* Indicator Flags */}
                          <div className="mb-2 flex flex-wrap gap-2">
                            <Badge 
                              tone={isReleased ? "success" : "neutral"}
                              className="text-[9px] uppercase font-extrabold tracking-wider"
                            >
                              <span className="mr-1 inline-block -mt-0.5">
                                {isReleased ? <Eye size={10} /> : <EyeOff size={10} />}
                              </span>
                              {isReleased ? "Visible to student" : "Draft (Hidden)"}
                            </Badge>
                            
                            {release?.release_annotated_pdfs && (
                              <Badge tone="accent" className="text-[8px] uppercase tracking-wide">
                                Annotated PDF
                              </Badge>
                            )}
                            {release?.release_comments && (
                              <Badge tone="accent" className="text-[8px] uppercase tracking-wide">
                                Comments
                              </Badge>
                            )}
                            {release?.release_marks && (
                              <Badge tone="accent" className="text-[8px] uppercase tracking-wide">
                                Marks
                              </Badge>
                            )}
                          </div>

                          {/* Student Details */}
                          <h4 className="font-extrabold text-slate-900 tracking-tight text-sm">
                            👤 {student?.display_name ?? "Simulation Candidate"}
                          </h4>
                          <p className="text-xs text-[var(--muted)] font-semibold mt-1">
                            Paper: {assessment?.paper_code ?? "N/A"} · ID: {attempt.id.slice(0, 8).toUpperCase()}
                          </p>
                        </div>

                        {/* Dispatch Options */}
                        <div className="flex flex-wrap gap-2 mt-3 md:mt-0">
                          <ButtonLink 
                            href={`/owner/attempts/${attempt.id}/mark`}
                            className="text-xs font-bold bg-slate-900 text-white hover:bg-black active:scale-95 transition-all py-2 px-3.5 border-0 shadow-sm"
                          >
                            Open Dispatch Panel
                          </ButtonLink>
                          
                          <ButtonLink 
                            href={`/student/attempts/${attempt.id}/receipt`} 
                            variant="secondary"
                            className="text-xs font-semibold py-2 px-3.5 hover:bg-slate-100"
                          >
                            Preview Script
                          </ButtonLink>
                        </div>
                      </Card>
                    );
                  })}
                </div>

              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
