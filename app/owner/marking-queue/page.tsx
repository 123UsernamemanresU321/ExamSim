import { AlertTriangle, CheckCircle2, FileText, Send, ShieldAlert, BadgeInfo } from "lucide-react";
import { assignMarker } from "@/app/owner/operations-actions";
import { SavedViewsToolbar } from "@/components/owner/saved-views-toolbar";
import { SectionHeading } from "@/components/section-heading";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataListMeta, DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { listMarkingQueue } from "@/lib/usability-data";
import { listMarkerAssignments, listOwnerSavedViews } from "@/lib/owner-operations";
import type { AttemptState } from "@/lib/constants";
import { markingProgress, type MarkingQueueSection } from "@/lib/marking-queue";

const sectionLabels: Record<string, string> = {
  needs_marking: "Needs marking",
  partially_marked: "Partially marked",
  high_moderation_signal: "High Moderation Alert",
  missing_uploads: "Missing uploads",
  feedback_ready: "Release Pending",
  released: "Feedback Released",
  incident_affected: "Incident Reported",
};

export default async function MarkingQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const sectionFilter = typeof params.section === "string" ? params.section : "";
  const [allRows, views, assignments] = await Promise.all([
    listMarkingQueue(),
    listOwnerSavedViews("marking_queue"),
    listMarkerAssignments(),
  ]);
  const rows = sectionFilter ? allRows.filter((row) => row.sections.includes(sectionFilter as MarkingQueueSection)) : allRows;

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
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/owner/marking-queue/moderation" variant="secondary">Open moderation queue</ButtonLink>
        <ButtonLink href="/owner/marking-queue/workload" variant="secondary">Marker workload</ButtonLink>
      </div>
      <SavedViewsToolbar scope="marking_queue" views={views} basePath="/owner/marking-queue" currentFilters={{ section: sectionFilter }} />
      <form className="flex flex-wrap gap-2 rounded-[4px] border border-[var(--border)] bg-white p-3">
        <select name="section" defaultValue={sectionFilter} className="h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
          <option value="">All queue sections</option>
          {Object.entries(sectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="submit" className="h-10 rounded-[2px] bg-[var(--primary)] px-4 text-sm font-semibold !text-white">Apply queue filter</button>
      </form>

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
        <DataTable headers={["Script", "Queue status", "Progress", "Moderation", "Actions"]}>
          {rows.map((row) => {
            const progress = markingProgress(row);
            const isHighMod = row.sections.includes("high_moderation_signal");
            const isIncident = row.sections.includes("incident_affected");
            const queueRow = row as typeof row & { state?: string };
            const state = toAttemptState(queueRow.state);
            
            return (
              <DataTableRow
                key={row.attempt_id} 
                className={`border-l-4 ${
                  isHighMod ? "border-l-[var(--danger)]" : isIncident ? "border-l-[var(--warning)]" : "border-l-transparent"
                }`}
              >
                <DataTableCell className="min-w-[260px]">
                  <h2 className="truncate font-semibold text-[var(--ink)]">{row.assessment_title}</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {row.student_name} · Paper <span className="font-mono">{row.paper_code ?? "N/A"}</span>
                  </p>
                </DataTableCell>

                <DataTableCell className="min-w-[260px]">
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
                </DataTableCell>

                <DataTableCell>
                  <div className="grid gap-2 text-xs text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <FileText size={14} className="text-[var(--subtle)]" />
                      <strong className="text-[var(--ink)]">{row.uploaded_slots}/{row.total_upload_slots}</strong> uploads
                    </span>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-[var(--subtle)]" />
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-[2px] border border-[var(--border)] bg-[var(--surface-panel)]">
                          <span 
                            className={`block h-full ${progress === 100 ? "bg-[var(--success)]" : progress > 0 ? "bg-[var(--primary)]" : "bg-[var(--surface-panel)]"}`} 
                            style={{ width: `${progress}%` }} 
                          />
                        </span>
                        <strong className="font-mono text-[var(--ink)]">{progress}%</strong>
                      </span>
                    </span>
                  </div>
                </DataTableCell>

                <DataTableCell>
                  <div className="grid gap-2 text-xs text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-[var(--subtle)]" />
                      <strong className="rounded-[2px] border border-[var(--border)] bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--ink)]">
                        {row.moderation_severity ?? "none"}
                      </strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Send size={14} className="text-[var(--subtle)]" />
                      <strong className="text-[var(--ink)]">{row.feedback_released ? "Released" : "Held"}</strong>
                    </span>
                  </div>
                </DataTableCell>

                <DataTableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                  <details className="relative">
                    <summary className="inline-flex min-h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-[2px] border border-[var(--border)] bg-white px-4 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] [&::-webkit-details-marker]:hidden">
                      Assign
                    </summary>
                    <form action={assignMarker} className="absolute right-0 z-20 mt-2 grid w-64 gap-2 rounded-[4px] border border-[var(--border)] bg-white p-3 text-left shadow-[var(--shadow-card)]">
                      <input type="hidden" name="attempt_id" value={row.attempt_id} />
                      <input type="hidden" name="marker_profile_id" value="" />
                      <p className="text-xs text-[var(--muted)]">
                        Assigns this script to the current owner profile for v1 marker tracking.
                      </p>
                      <button type="submit" className="h-9 rounded-[2px] bg-[var(--primary)] px-3 text-xs font-semibold !text-white">Assign to me</button>
                    </form>
                  </details>
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
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </DataTable>
      )}
      {assignments.length ? (
        <section className="rounded-[4px] border border-[var(--border)] bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">Marker assignments</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {assignments.slice(0, 12).map((assignment) => (
              <Badge key={assignment.id} tone={assignment.status === "completed" || assignment.status === "released" ? "success" : assignment.status === "in_progress" ? "warning" : "neutral"}>
                {assignment.assignment_scope.replaceAll("_", " ")} · {assignment.status}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function toAttemptState(value: string | undefined): AttemptState {
  return value === "WAITING" || value === "ACTIVE" || value === "UPLOAD_ONLY" || value === "FINISHED_REVIEW" ? value : "FINISHED_REVIEW";
}
