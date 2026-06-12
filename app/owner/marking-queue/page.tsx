import { AlertTriangle, CheckCircle2, FileText, Send, ShieldAlert, BadgeInfo } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { listMarkingQueue } from "@/lib/usability-data";
import type { AttemptState } from "@/lib/constants";
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

  const totalAttempts = rows.length;
  const needsMarkingCount = rows.filter((r) => r.sections.includes("needs_marking")).length;
  const highModCount = rows.filter((r) => r.sections.includes("high_moderation_signal")).length;
  const incidentCount = rows.filter((r) => r.sections.includes("incident_affected")).length;

  return (
    <main className="space-y-6 pb-12">
      <SectionHeading
        title="Marking queue"
        description="Triage scripts by marking progress, upload status, moderation signals, incidents, and feedback release state."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active scripts" value={totalAttempts} />
        <StatCard label="Needs marking" value={needsMarkingCount} tone={needsMarkingCount ? "info" : "neutral"} />
        <StatCard label="Moderation signals" value={highModCount} tone={highModCount ? "danger" : "neutral"} />
        <StatCard label="Incident logs" value={incidentCount} tone={incidentCount ? "warning" : "neutral"} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No scripts in the marking queue"
          description="Attempts will appear here after students submit work or when moderation, upload, incident, or release states need review."
        />
      ) : (
        <DataList>
          {rows.map((row) => {
            const progress = markingProgress(row);
            const isHighMod = row.sections.includes("high_moderation_signal");
            const isIncident = row.sections.includes("incident_affected");
            const queueRow = row as typeof row & { state?: string };
            const state = toAttemptState(queueRow.state);
            
            return (
              <DataListRow
                key={row.attempt_id} 
                className={`grid gap-4 border-l-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${
                  isHighMod ? "border-l-[var(--danger)]" : isIncident ? "border-l-[var(--warning)]" : "border-l-transparent"
                }`}
              >
                <div className="min-w-0">
                  <DataListMeta className="mb-2.5">
                    <AttemptStateBadge state={state} />
                    {row.sections.map((section) => {
                      const isMod = section === "high_moderation_signal";
                      const isInc = section === "incident_affected";
                      const isRel = section === "released";
                      return (
                        <Badge 
                          key={section} 
                          tone={isMod ? "danger" : isInc ? "warning" : isRel ? "success" : "neutral"}
                          className="uppercase tracking-[0.08em]"
                        >
                          {isMod ? <ShieldAlert size={10} className="mr-1 inline-block -mt-0.5" /> : null}
                          {isInc ? <BadgeInfo size={10} className="mr-1 inline-block -mt-0.5" /> : null}
                          {sectionLabels[section] || section}
                        </Badge>
                      );
                    })}
                  </DataListMeta>

                  <h2 className="truncate text-base font-semibold text-[var(--ink)]">{row.assessment_title}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {row.student_name} · Paper {row.paper_code ?? "N/A"}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <FileText size={14} className="text-[var(--subtle)]" />
                      Uploads: <strong className="text-[var(--ink)]">{row.uploaded_slots}/{row.total_upload_slots}</strong>
                    </span>

                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-[var(--subtle)]" />
                      Marking:
                      <div className="inline-flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-panel)]">
                          <div 
                            className={`h-full rounded-full ${progress === 100 ? "bg-[var(--success)]" : progress > 0 ? "bg-[var(--primary)]" : "bg-[var(--surface-panel)]"}`} 
                            style={{ width: `${progress}%` }} 
                          />
                        </div>
                        <strong className="text-[var(--ink)]">{progress}%</strong>
                      </div>
                    </span>

                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-[var(--subtle)]" />
                      Moderation: 
                      <strong className="rounded border border-[var(--border)] bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--ink)]">
                        {row.moderation_severity ?? "none"}
                      </strong>
                    </span>

                    <span className="flex items-center gap-1.5">
                      <Send size={14} className="text-[var(--subtle)]" />
                      Feedback: <strong className="text-[var(--ink)]">{row.feedback_released ? "Released" : "Held"}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <ButtonLink 
                    href={`/owner/attempts/${row.attempt_id}/mark`}
                  >
                    Mark
                  </ButtonLink>
                  <ButtonLink 
                    href={`/owner/attempts/${row.attempt_id}/report`} 
                    variant="secondary"
                  >
                    Timeline
                  </ButtonLink>
                  <ButtonLink 
                    href={`/owner/attempts/${row.attempt_id}/recovery`} 
                    variant="secondary"
                  >
                    Recovery
                  </ButtonLink>
                </div>
              </DataListRow>
            );
          })}
        </DataList>
      )}
    </main>
  );
}

function toAttemptState(value: string | undefined): AttemptState {
  return value === "WAITING" || value === "ACTIVE" || value === "UPLOAD_ONLY" || value === "FINISHED_REVIEW" ? value : "FINISHED_REVIEW";
}
