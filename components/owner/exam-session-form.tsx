import { CalendarClock, KeyRound } from "lucide-react";
import { createExamSessionAction } from "@/app/owner/exam-sessions/actions";
import type { SessionAssessmentOption } from "@/lib/examsim/session-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ExamSessionForm({ options }: { options: SessionAssessmentOption[] }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-[4px] bg-[var(--surface-muted)] text-[var(--primary)]">
          <CalendarClock size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Create exam session</h2>
          <p className="text-sm text-[var(--muted)]">Publish a code-based sitting without requiring student accounts.</p>
        </div>
      </div>
      <form action={createExamSessionAction} className="mt-6 grid gap-4">
        <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
          Assessment version
          <select name="assessment_version_selection" required className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
            <option value="">Select an approved assessment</option>
            {options.map((option) => (
              <option key={option.assessment.id} value={`${option.assessment.id}|${option.latestVersion?.id ?? ""}`} disabled={!option.latestVersion}>
                {option.assessment.title} {option.assessment.paper_code ? `· ${option.assessment.paper_code}` : ""} {option.latestVersion ? `(v${option.latestVersion.version_no}, ${option.latestVersion.status})` : "(no version)"}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
          Session title
          <input name="title" placeholder="MODS Mock Week 8 90" required className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Open from
            <input name="open_at_utc" type="datetime-local" required className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Start time
            <input name="start_at_utc" type="datetime-local" required className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Duration minutes
            <input name="duration_minutes" type="number" min="1" defaultValue="90" required className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Upload grace minutes
            <input name="upload_grace_minutes" type="number" min="0" defaultValue="15" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Attempt limit
            <input name="attempt_limit_per_student" type="number" min="1" defaultValue="1" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Security mode
            <select name="mode" defaultValue="timed" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
              <option value="practice">Practice mode</option>
              <option value="timed">Timed mode</option>
              <option value="controlled">Controlled browser mode</option>
              <option value="seb_required">Safe Exam Browser required</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Code <span className="font-normal text-[var(--muted)]">(optional)</span>
            <div className="flex rounded-[2px] border border-[var(--border)] bg-white">
              <span className="grid w-10 place-items-center border-r border-[var(--border)] text-[var(--muted)]">
                <KeyRound size={16} aria-hidden="true" />
              </span>
              <input name="code" placeholder="Leave blank to generate" className="min-h-11 flex-1 bg-transparent px-3 font-mono text-sm uppercase outline-none" />
            </div>
          </label>
        </div>
        <input name="display_timezone" type="hidden" value="Africa/Johannesburg" />
        <Button type="submit">Create session</Button>
      </form>
    </Card>
  );
}
