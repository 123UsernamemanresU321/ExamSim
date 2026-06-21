import { Plus } from "lucide-react";
import { ExamSessionForm } from "@/components/owner/exam-session-form";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionHeading } from "@/components/section-heading";
import { listOwnerExamSessions, listSessionAssessmentOptions } from "@/lib/examsim/session-data";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";

export default async function OwnerExamSessionsPage() {
  await requireInstitutionPagePermission("session_publishing", "/owner/exam-sessions");
  const [sessions, options] = await Promise.all([listOwnerExamSessions(), listSessionAssessmentOptions()]);

  return (
    <>
      <SectionHeading
        title="Exam Sessions"
        description="Run no-login exam-code sittings with roster-first identity matching and server-controlled timing."
        actions={<ButtonLink href="/owner/exam-sessions#new"><Plus size={16} aria-hidden="true" /> New session</ButtonLink>}
      />
      {sessions.length ? (
        <DataTable headers={["Session", "Window", "Status", "Attempts", "Actions"]}>
          {sessions.map((session) => (
            <DataTableRow key={session.id}>
              <DataTableCell>
                <h2 className="font-semibold text-[var(--ink)]">{session.title}</h2>
                <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">{session.paper_code ?? "NO-CODE"} · hint {session.code_display_hint ?? "none"}</p>
              </DataTableCell>
              <DataTableCell>
                <p className="text-[13px] text-[var(--ink)]">{new Date(session.start_at_utc).toLocaleString()}</p>
                <p className="text-xs text-[var(--muted)]">{Math.round(session.duration_seconds / 60)} min · {session.display_timezone}</p>
              </DataTableCell>
              <DataTableCell><StatusBadge status={session.status} /></DataTableCell>
              <DataTableCell><span className="font-mono text-sm font-semibold">{session.attempt_count}</span></DataTableCell>
              <DataTableCell>
                <div className="flex justify-end gap-2">
                  <ButtonLink href={`/owner/exam-sessions/${session.id}`} variant="secondary">Open</ButtonLink>
                  <ButtonLink href={`/owner/exam-sessions/${session.id}/live`} variant="secondary">Live</ButtonLink>
                </div>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No exam sessions yet"
          description="Create a code-based sitting when students should enter without accounts."
          action={<ButtonLink href="#new">Create session</ButtonLink>}
        />
      )}
      <div id="new" className="mt-6">
        <ExamSessionForm options={options} />
      </div>
    </>
  );
}
