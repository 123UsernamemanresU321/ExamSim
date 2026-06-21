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
        <div className="rounded-[4px] border border-blue-100 bg-blue-50/40 p-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Student identity policy</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Students enter the exam code first, then their roster student number and name. Student numbers identify students; they are not passwords.
          </p>
          <div className="mt-4 grid gap-3">
            <label className="flex items-start gap-3 text-sm leading-6">
              <input name="require_roster_match" type="checkbox" defaultChecked className="mt-1" />
              <span>
                <strong>Require roster match</strong>
                <span className="block text-[var(--muted)]">Default on. The student number must exist in your roster for this owner account.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm leading-6">
              <input name="allow_unregistered_guests" type="checkbox" className="mt-1" />
              <span>
                <strong>Allow unregistered guest students</strong>
                <span className="block text-amber-700">Use only for open practice sessions. This may make student tracking harder.</span>
              </span>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input name="require_student_number" type="checkbox" defaultChecked />
                Require student number
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="require_student_name" type="checkbox" defaultChecked />
                Require student name
              </label>
            </div>
          </div>
        </div>
        <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Session accommodation defaults</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            These defaults apply to the session. A student-specific roster policy may override them. Rest breaks remain invigilator controlled.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="flex items-start gap-3 text-sm leading-6 md:col-span-2">
              <input name="rest_break_allowed" type="checkbox" className="mt-1" />
              <span><strong>Allow approved rest breaks</strong><span className="block text-[var(--muted)]">The server pauses writing and extends the deadline only when an invigilator resumes the attempt.</span></span>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
              Maximum break minutes
              <input name="rest_break_max_minutes" type="number" min="1" max="240" defaultValue="15" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
              Default text size
              <select name="font_scale_percent" defaultValue="100" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
                <option value="100">Standard</option><option value="125">Large</option><option value="150">Extra large</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
              Default contrast
              <select name="contrast_mode" defaultValue="standard" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
                <option value="standard">Standard</option><option value="high">High contrast</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
              Calculator policy
              <select name="calculator_policy" defaultValue="none" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
                <option value="none">Not allowed</option><option value="basic">Basic</option><option value="scientific">Scientific</option><option value="graphing">Graphing, externally supplied</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm"><input name="dyslexia_font" type="checkbox" /> Use readable font by default</label>
            <label className="flex items-center gap-2 text-sm"><input name="formula_booklet_allowed" type="checkbox" /> Formula booklet allowed</label>
          </div>
          <label className="mt-4 grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Approved materials
            <textarea name="allowed_materials" rows={3} placeholder="One item per line" className="rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm" />
          </label>
        </div>
        <input name="display_timezone" type="hidden" value="Africa/Johannesburg" />
        <Button type="submit">Create session</Button>
      </form>
    </Card>
  );
}
