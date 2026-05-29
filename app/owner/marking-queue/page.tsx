import { AlertTriangle, CheckCircle2, FileText, Send, ShieldAlert, BadgeInfo } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listMarkingQueue } from "@/lib/usability-data";
import { markingProgress } from "@/lib/marking-queue";

const sectionLabels: Record<string, string> = {
  needs_marking: "Needs marking",
  partially_marked: "Partially marked",
  high_moderation_signal: "High Moderation Alert",
  missing_uploads: "Missing uploads",
  feedback_ready: "Release Pending",
  released: "Feedback Released",
  incident_affected: "Incident Reported",
};

export default async function MarkingQueuePage() {
  const rows = await listMarkingQueue();

  // Summary Metrics Calculation
  const totalAttempts = rows.length;
  const needsMarkingCount = rows.filter((r) => r.sections.includes("needs_marking")).length;
  const highModCount = rows.filter((r) => r.sections.includes("high_moderation_signal")).length;
  const incidentCount = rows.filter((r) => r.sections.includes("incident_affected")).length;

  return (
    <main className="max-w-[1200px] mx-auto space-y-6 pb-12">
      <SectionHeading
        title="Owner Marking Control Center"
        description="Monitor, grade, and moderate cohort simulation scripts. Resolve incident reports and coordinate feedback releases."
      />

      {/* Cohort Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Card className="border-[#dde3ee] shadow-sm bg-white p-5 flex flex-col justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Active Scripts</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{totalAttempts}</h3>
        </Card>
        <Card className="border-[#dde3ee] shadow-sm bg-white p-5 flex flex-col justify-between border-l-4 border-l-blue-600">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">Unstarted / Queue</p>
          <h3 className="text-2xl font-black text-blue-950 mt-1">{needsMarkingCount}</h3>
        </Card>
        <Card className="border-[#dde3ee] shadow-sm bg-white p-5 flex flex-col justify-between border-l-4 border-l-rose-500">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800">Moderation Signals</p>
          <h3 className="text-2xl font-black text-rose-950 mt-1">{highModCount}</h3>
        </Card>
        <Card className="border-[#dde3ee] shadow-sm bg-white p-5 flex flex-col justify-between border-l-4 border-l-amber-500">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Incident Logs</p>
          <h3 className="text-2xl font-black text-amber-950 mt-1">{incidentCount}</h3>
        </Card>
      </div>

      {/* Triage Queue List */}
      <div className="space-y-4">
        {rows.length === 0 ? (
          <Card className="p-8 text-center border-dashed border-2">
            <p className="text-sm text-[var(--muted)] font-semibold italic">No active assessment scripts found in the marking queue.</p>
          </Card>
        ) : (
          rows.map((row) => {
            const progress = markingProgress(row);
            const isHighMod = row.sections.includes("high_moderation_signal");
            const isIncident = row.sections.includes("incident_affected");
            
            return (
              <Card 
                key={row.attempt_id} 
                className={`grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center p-5 border transition-all duration-200 hover:shadow-md bg-white ${
                  isHighMod 
                    ? "border-rose-200 border-l-[6px] border-l-rose-500 bg-rose-50/5" 
                    : isIncident 
                    ? "border-amber-200 border-l-[6px] border-l-amber-500 bg-amber-50/5"
                    : "border-[#dde3ee]"
                }`}
              >
                <div>
                  {/* Status & Flag Badges */}
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <AttemptStateBadge state={((row as any).state as never) ?? "FINISHED_REVIEW"} />
                    {row.sections.map((section) => {
                      const isMod = section === "high_moderation_signal";
                      const isInc = section === "incident_affected";
                      const isRel = section === "released";
                      return (
                        <Badge 
                          key={section} 
                          tone={isMod ? "danger" : isInc ? "warning" : isRel ? "success" : "neutral"}
                          className="text-[9px] uppercase font-extrabold tracking-wider"
                        >
                          {isMod && <ShieldAlert size={10} className="mr-1 inline-block -mt-0.5" />}
                          {isInc && <BadgeInfo size={10} className="mr-1 inline-block -mt-0.5" />}
                          {sectionLabels[section] || section}
                        </Badge>
                      );
                    })}
                  </div>

                  {/* Header Title */}
                  <h2 className="text-base font-extrabold text-[var(--ink)] tracking-tight">{row.assessment_title}</h2>
                  <p className="text-xs text-[var(--muted)] font-semibold mt-1">
                    👥 {row.student_name} · Paper {row.paper_code ?? "N/A"}
                  </p>

                  {/* Detailed Metrics Footer */}
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <FileText size={14} className="text-slate-500" />
                      Uploads: <strong className="text-slate-900">{row.uploaded_slots}/{row.total_upload_slots}</strong>
                    </span>

                    {/* Highly Visual Progress Bar */}
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-slate-500" />
                      Marking Progress:
                      <div className="inline-flex items-center gap-2">
                        <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 shadow-inner">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              progress === 100 
                                ? "bg-emerald-600" 
                                : progress > 0 
                                ? "bg-blue-600" 
                                : "bg-slate-300"
                            }`} 
                            style={{ width: `${progress}%` }} 
                          />
                        </div>
                        <strong className="text-slate-950 font-bold">{progress}%</strong>
                      </div>
                    </span>

                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-slate-500" />
                      Moderation: 
                      <strong className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        row.moderation_severity === "high" 
                          ? "bg-rose-100 text-rose-800" 
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {row.moderation_severity ?? "none"}
                      </strong>
                    </span>

                    <span className="flex items-center gap-1.5">
                      <Send size={14} className="text-slate-500" />
                      Dispatch: <strong className="text-slate-900">{row.feedback_released ? "Released" : "Held in Triage"}</strong>
                    </span>
                  </div>
                </div>

                {/* Queue Actions */}
                <div className="flex flex-wrap gap-2 lg:justify-end mt-4 lg:mt-0">
                  <ButtonLink 
                    href={`/owner/attempts/${row.attempt_id}/mark`}
                    className="shadow-sm font-bold bg-gradient-to-r from-blue-700 to-indigo-700 text-white hover:brightness-110 active:scale-95 transition-all py-2 px-4"
                  >
                    Evaluate Answer
                  </ButtonLink>
                  <ButtonLink 
                    href={`/owner/attempts/${row.attempt_id}/report`} 
                    variant="secondary"
                    className="text-xs font-semibold py-2 px-3 hover:bg-slate-100"
                  >
                    Timeline
                  </ButtonLink>
                  <ButtonLink 
                    href={`/owner/attempts/${row.attempt_id}/recovery`} 
                    variant="secondary"
                    className="text-xs font-semibold py-2 px-3 hover:bg-slate-100"
                  >
                    Recovery
                  </ButtonLink>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </main>
  );
}
