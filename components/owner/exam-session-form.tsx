"use client";

import { useState } from "react";
import { CalendarClock, KeyRound } from "lucide-react";
import { createExamSessionAction } from "@/app/owner/exam-sessions/actions";
import type { SessionAssessmentOption } from "@/lib/examsim/session-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExamPolicySummary } from "@/components/exam/exam-policy-summary";

export function ExamSessionForm({ options }: { options: SessionAssessmentOption[] }) {
  const [selection, setSelection] = useState("");
  const selectedOption = options.find((option) => `${option.assessment.id}|${option.latestVersion?.id ?? ""}` === selection) ?? null;
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
          <select name="assessment_version_selection" required value={selection} onChange={(event) => setSelection(event.target.value)} className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm">
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
        <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Safe Exam Browser keys</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Required only when Security mode is Safe Exam Browser. Copy the 64-character Browser Exam Key and Config Key from the final tested .seb configuration. User-agent text is never accepted as proof.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">Browser Exam Key<input name="seb_browser_exam_key_hashes" placeholder="64-character hex key" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 font-mono text-sm" /></label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">Config Key<input name="seb_config_key_hashes" placeholder="64-character hex key" className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 font-mono text-sm" /></label>
          </div>
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
          <h3 className="text-sm font-semibold text-[var(--ink)]">Session accessibility defaults</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Display preferences and rest breaks may be adjusted per student. Exam-wide calculators, browser tools, physical materials, and booklets come from the approved assessment policy below.
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
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm"><input name="dyslexia_font" type="checkbox" /> Use readable font by default</label>
          </div>
        </div>
        <div className="rounded-[4px] border border-blue-100 bg-blue-50/40 p-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Inherited materials and tools</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">The session cannot remove Required items or enable Not permitted items. It may only prohibit an item that the assessment marks Allowed.</p>
          {selectedOption ? (
            <div className="mt-4 grid gap-4">
              <ExamPolicySummary policy={selectedOption.examPolicy} />
              {selectedOption.examPolicy.tools.some((tool) => tool.requirement === "allowed") || selectedOption.examPolicy.resources.some((resource) => resource.requirement === "allowed") ? (
                <div className="grid gap-3 rounded-[4px] border border-[var(--border)] bg-white p-4 md:grid-cols-2">
                  {selectedOption.examPolicy.tools.filter((tool) => tool.requirement === "allowed").map((tool) => <label key={tool.code} className="flex items-start gap-3 text-sm leading-5"><input type="checkbox" name={`prohibit_tool_${tool.code}`} className="mt-1" /><span><strong>Prohibit {tool.code.replaceAll("_", " ")}</strong><span className="block text-[var(--muted)]">Tighten this session only.</span></span></label>)}
                  {selectedOption.examPolicy.resources.filter((resource) => resource.requirement === "allowed").map((resource) => <label key={resource.id} className="flex items-start gap-3 text-sm leading-5"><input type="checkbox" name={`prohibit_resource_${resource.id}`} className="mt-1" /><span><strong>Prohibit {resource.title}</strong><span className="block text-[var(--muted)]">The resource remains assigned to the assessment version.</span></span></label>)}
                </div>
              ) : <p className="rounded-[3px] border border-[var(--border)] bg-white p-3 text-sm text-[var(--muted)]">This policy has no optional items that a session can tighten.</p>}
            </div>
          ) : <p className="mt-4 text-sm text-[var(--muted)]">Choose an assessment version to preview its frozen exam-wide policy.</p>}
        </div>
        <input name="display_timezone" type="hidden" value="Africa/Johannesburg" />
        <Button type="submit">Create session</Button>
      </form>
    </Card>
  );
}
