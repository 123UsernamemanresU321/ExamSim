import { AlertTriangle, CheckCircle2, FileText, Send } from "lucide-react";
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
  high_moderation_signal: "High moderation signal",
  missing_uploads: "Missing uploads",
  feedback_ready: "Feedback ready to release",
  released: "Released",
  incident_affected: "Incident affected",
};

export default async function MarkingQueuePage() {
  const rows = await listMarkingQueue();
  return (
    <>
      <SectionHeading
        title="Marking Queue"
        description="Triage all review work from one place: missing uploads, moderation signals, partial marking, and release-ready attempts."
      />
      <div className="grid gap-4">
        {rows.length === 0 ? (
          <Card><p className="text-sm text-[var(--muted)]">No attempts are waiting in the marking queue.</p></Card>
        ) : rows.map((row) => {
          const progress = markingProgress(row);
          return (
            <Card key={row.attempt_id} className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <AttemptStateBadge state={(row.state as never) ?? "FINISHED_REVIEW"} />
                  {row.sections.map((section) => (
                    <Badge key={section} tone={section === "high_moderation_signal" ? "warning" : section === "released" ? "success" : "neutral"}>
                      {sectionLabels[section]}
                    </Badge>
                  ))}
                </div>
                <h2 className="text-lg font-semibold text-[var(--ink)]">{row.assessment_title}</h2>
                <p className="text-sm text-[var(--muted)]">{row.student_name} · {row.paper_code ?? "No paper code"}</p>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-[var(--muted)] md:grid-cols-4">
                  <span><FileText size={14} className="mr-1 inline" /> Uploads {row.uploaded_slots}/{row.total_upload_slots}</span>
                  <span><CheckCircle2 size={14} className="mr-1 inline" /> Marking {progress}%</span>
                  <span><AlertTriangle size={14} className="mr-1 inline" /> Moderation {row.moderation_severity ?? "none"}</span>
                  <span><Send size={14} className="mr-1 inline" /> {row.feedback_released ? "Released" : "Unreleased"}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/owner/attempts/${row.attempt_id}/mark`}>Mark</ButtonLink>
                <ButtonLink href={`/owner/attempts/${row.attempt_id}/report`} variant="secondary">Timeline</ButtonLink>
                <ButtonLink href={`/owner/attempts/${row.attempt_id}/recovery`} variant="secondary">Recovery</ButtonLink>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
