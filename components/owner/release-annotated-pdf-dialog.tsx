"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type FeedbackReleaseChecklist = {
  marks_reviewed: boolean;
  feedback_reviewed: boolean;
  visibility_reviewed: boolean;
};

export function ReleaseAnnotatedPdfDialog({
  open,
  isSaving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (checklist: FeedbackReleaseChecklist) => void;
}) {
  const [checklist, setChecklist] = useState<FeedbackReleaseChecklist>({ marks_reviewed: false, feedback_reviewed: false, visibility_reviewed: false });
  if (!open) return null;
  const complete = Object.values(checklist).every(Boolean);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Release annotated PDF">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-popover)]">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Release annotated work?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This releases student-visible annotations and feedback through the existing secure feedback flow. Draft/private annotations remain hidden.
        </p>
        <div className="mt-5 grid gap-2">
          <CheckRow checked={checklist.marks_reviewed} label="All markable questions have a saved mark." onChange={(checked) => setChecklist((current) => ({ ...current, marks_reviewed: checked }))} />
          <CheckRow checked={checklist.feedback_reviewed} label="Student feedback and annotations are final." onChange={(checked) => setChecklist((current) => ({ ...current, feedback_reviewed: checked }))} />
          <CheckRow checked={checklist.visibility_reviewed} label="Private marker notes remain hidden." onChange={(checked) => setChecklist((current) => ({ ...current, visibility_reviewed: checked }))} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" isLoading={isSaving} disabled={!complete} onClick={() => onConfirm(checklist)}>
            {isSaving ? "Releasing..." : "Release to student"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm">
      <input className="mt-0.5" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
